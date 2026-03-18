"""
BuilderAI Agent Service — FastAPI + LangGraph Multi-Agent Pipeline

Endpoints:
  POST /generate          — Trigger the full agent pipeline, stream SSE events
  POST /stop/{project_id} — Immediately kill all subprocesses for a project
  GET  /health            — Health check
"""

import json
import os
import asyncio
import time
from collections import defaultdict
from pathlib import Path
from typing import AsyncGenerator, Optional

from fastapi import FastAPI, HTTPException, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from the same directory as this script (works regardless of CWD).
# Use override=True so values in .env take priority over any empty shell env vars.
_here = Path(__file__).parent
load_dotenv(_here / ".env", override=True)
# Also try CWD-relative as fallback
load_dotenv(override=True)

# Remove CLAUDECODE so CLI subprocesses (claude -p) aren't blocked by Claude Code's
# nested-session guard. This is safe — we only affect subprocess inheritance.
os.environ.pop("CLAUDECODE", None)

# ─── Simple in-memory rate limiter ───────────────────────────────────────────
# Uses a sliding window per IP address. No external dependencies required.
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_RPM = int(os.getenv("RATE_LIMIT_RPM", "10"))


def _check_rate_limit(client_ip: str) -> bool:
    """Returns True if the request is within the rate limit, False otherwise."""
    now = time.time()
    window_start = now - 60.0
    timestamps = [t for t in _rate_limit_store[client_ip] if t > window_start]
    if len(timestamps) >= RATE_LIMIT_RPM:
        _rate_limit_store[client_ip] = timestamps
        return False
    timestamps.append(now)
    _rate_limit_store[client_ip] = timestamps
    return True


app = FastAPI(
    title="BuilderAI Agent Service",
    description="Multi-agent pipeline powered by LangGraph and Claude",
    version="1.0.0",
)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    project_id: str
    prompt: str
    conversation_history: list[dict] = []
    previous_files: Optional[dict] = None
    previous_blueprint: Optional[dict] = None
    llm_mode: str = "cli"       # "cli" or "api"
    llm_model: Optional[str] = None  # e.g. "claude-sonnet-4-20250514"


def format_sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


async def run_pipeline_stream(request: GenerateRequest) -> AsyncGenerator[str, None]:
    """
    Run the full LangGraph multi-agent pipeline and yield SSE events.

    Since BuilderState uses Annotated[list, operator.add] for events,
    LangGraph accumulates ALL events across nodes in each snapshot.
    We track the total count of events sent to only yield NEW ones.
    """
    from graph.pipeline import get_pipeline
    from graph.state import BuilderState
    from utils.llm_provider import set_project_context, kill_project_processes

    pipeline = get_pipeline()

    # Register project context so subprocesses spawned by any agent in this
    # request are tracked under this project_id and can be killed on stop.
    set_project_context(request.project_id)

    initial_state: BuilderState = {
        "project_id": request.project_id,
        "user_prompt": request.prompt,
        "conversation_history": request.conversation_history,
        "previous_files": request.previous_files,
        "previous_blueprint": request.previous_blueprint,
        "llm_mode": request.llm_mode,
        "llm_model": request.llm_model,
        "blueprint": None,
        "frontend_files": None,
        "backend_files": None,
        "integrated_files": None,
        "final_files": None,
        "qa_result": None,
        "retry_count": 0,
        "max_retries": 0,
        "current_agent": "architect",
        "errors": [],
        "events": [],
    }

    # Use a queue to stream events as they're produced
    event_queue: asyncio.Queue = asyncio.Queue()

    # NOTE: agent_start events are emitted by the pipeline nodes themselves
    # (architect_with_start, etc. in pipeline.py) — no need to duplicate here.

    async def run_and_collect():
        """Run pipeline and put events in queue."""
        # Track errors already sent to avoid duplicates.
        # Errors use Annotated[list, operator.add] in BuilderState, which means
        # any node that spreads **state without overriding "errors" will re-emit
        # all accumulated errors. We deduplicate by only sending each unique
        # error message once.
        sent_errors: set[str] = set()

        try:
            # stream_mode="updates" yields only what each node returned (deltas),
            # not the full accumulated state. This means we get exactly the events
            # each agent produced — no counter needed, no events skipped.
            async for state_snapshot in pipeline.astream(initial_state, stream_mode="updates"):
                for node_name, node_output in state_snapshot.items():
                    events = node_output.get("events", [])
                    for event in events:
                        await event_queue.put(event)

                    errors = node_output.get("errors", [])
                    for error in errors:
                        if error not in sent_errors:
                            sent_errors.add(error)
                            await event_queue.put({
                                "type": "error",
                                "message": error,
                            })

        except asyncio.CancelledError:
            # Client disconnected or /stop called — don't send error, just clean up
            raise  # Must re-raise so asyncio can cancel properly
        except Exception as e:
            await event_queue.put({
                "type": "error",
                "message": f"Pipeline error: {str(e)}",
            })
        finally:
            # Always send sentinel so the streaming loop can exit cleanly
            try:
                event_queue.put_nowait(None)
            except asyncio.QueueFull:
                pass

    # Start the pipeline task
    pipeline_task = asyncio.create_task(run_and_collect())

    # Yield events as they arrive — long timeout since agents make real API calls
    try:
        while True:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=600.0)
                if event is None:
                    break
                yield format_sse(event)
            except asyncio.TimeoutError:
                yield format_sse({"type": "error", "message": "Pipeline timeout — an agent took too long to respond"})
                pipeline_task.cancel()
                kill_project_processes(request.project_id)
                break
    except asyncio.CancelledError:
        # Client disconnected or /stop called — cancel pipeline AND kill subprocesses
        pipeline_task.cancel()
        kill_project_processes(request.project_id)
        return

    try:
        await pipeline_task
    except (asyncio.CancelledError, Exception):
        pass  # Already handled above

    yield "data: [DONE]\n\n"


@app.post("/generate")
async def generate(request: GenerateRequest, req: FastAPIRequest):
    """
    Trigger the multi-agent pipeline for a given prompt.
    Returns Server-Sent Events stream.
    """
    # Rate limiting — per client IP
    client_ip = req.client.host if req.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded ({RATE_LIMIT_RPM} requests/minute). Please wait before trying again."
        )

    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    # Only require API key in API mode — CLI mode uses the user's Claude subscription
    if request.llm_mode != "cli" and not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY not configured. Go to Settings and either add your API key or switch to CLI mode."
        )

    return StreamingResponse(
        run_pipeline_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/stop/{project_id}")
async def stop_pipeline(project_id: str):
    """
    Immediately kill all active CLI subprocesses for a project.
    Called by the Next.js frontend when the user clicks the Stop button.
    This is the definitive stop — it kills the actual claude process,
    not just the asyncio task wrapper around it.
    """
    from utils.llm_provider import kill_project_processes
    killed = kill_project_processes(project_id)
    return {
        "stopped": True,
        "project_id": project_id,
        "processes_killed": killed,
    }


class FixRequest(BaseModel):
    file_path: str
    file_content: str
    error_message: str
    related_files: dict[str, str] = {}
    llm_mode: str = "cli"
    llm_model: Optional[str] = None


@app.post("/fix")
async def fix_endpoint(request: FixRequest):
    """Surgical fix: repair a single broken file without re-running the full pipeline."""
    from agents.fix import fix_file
    try:
        fixed = fix_file(
            error_message=request.error_message,
            file_path=request.file_path,
            file_content=request.file_content,
            related_files=request.related_files,
            llm_mode=request.llm_mode,
            llm_model=request.llm_model,
        )
        return {"success": True, "file_path": request.file_path, "fixed_content": fixed}
    except Exception as e:
        return {"success": False, "error": str(e)}


class IterateRequest(BaseModel):
    project_id: str
    prompt: str
    current_files: dict
    llm_mode: str = "cli"
    llm_model: Optional[str] = None


@app.post("/iterate")
async def iterate_endpoint(request: IterateRequest, req: FastAPIRequest):
    """
    Surgical iteration: apply a small targeted change to existing files.
    Uses a single Sonnet call — ~10x cheaper than the full pipeline.
    Returns SSE: iterate_start → complete (with changed files) | error
    """
    client_ip = req.client.host if req.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded ({RATE_LIMIT_RPM} requests/minute)."
        )

    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    if not request.current_files:
        raise HTTPException(status_code=400, detail="No existing files — use /generate to build first")

    if request.llm_mode != "cli" and not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY not configured. Go to Settings and add your API key or switch to CLI mode."
        )

    async def stream_iterate() -> AsyncGenerator[str, None]:
        yield format_sse({"type": "iterate_start", "message": "Applying changes..."})
        try:
            from agents.iterate import iterate_files
            loop = asyncio.get_event_loop()
            changed = await loop.run_in_executor(
                None,
                lambda: iterate_files(
                    prompt=request.prompt,
                    current_files=request.current_files,
                    llm_mode=request.llm_mode,
                    llm_model=request.llm_model,
                ),
            )
            if not changed:
                yield format_sse({"type": "error", "message": "No files were changed by the iterate agent."})
            else:
                yield format_sse({
                    "type": "complete",
                    "files": changed,
                    "file_count": len(changed),
                })
        except Exception as e:
            yield format_sse({"type": "error", "message": str(e)})
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_iterate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    """Health check endpoint."""
    from config import LLM_MODE, AGENT_MODELS
    default_model = AGENT_MODELS.get("architect", "claude-opus-4-6")
    return {
        "status": "healthy",
        "service": "BuilderAI Agent Service",
        "llm_mode": LLM_MODE,
        "default_model": default_model,
        "pipeline": "LangGraph",
        "has_api_key": bool(os.getenv("ANTHROPIC_API_KEY")),
    }


@app.get("/")
async def root():
    return {
        "name": "BuilderAI Agent Service",
        "version": "1.0.0",
        "endpoints": ["/generate", "/stop/{project_id}", "/health"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )

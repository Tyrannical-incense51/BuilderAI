"""
Dual-mode LLM provider: Claude CLI (dev) or Anthropic API (production).

CLI mode  → calls `claude -p` subprocess → uses your Claude Code subscription
API mode  → calls anthropic SDK directly → uses ANTHROPIC_API_KEY
"""

import asyncio
import contextvars
import json
import logging
import os
import shutil
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger("llm_provider")


# ── Subprocess registry ───────────────────────────────────────────────────────
# Maps project_id → list of active asyncio.subprocess.Process objects.
# Lets the /stop endpoint kill in-flight claude CLI processes immediately.
_active_processes: dict[str, list] = {}

# Context variable — set once per request in main.py (before pipeline.astream)
# so every call_llm() in that request knows its project_id without signature changes.
# Python's ThreadPoolExecutor copies the calling context to submitted callables,
# so this value is visible even deep inside thread-pool + asyncio.run chains.
_current_project_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_project_id", default="__unknown__"
)


def set_project_context(project_id: str) -> None:
    """Call this in main.py before creating the pipeline task for a request."""
    _current_project_id.set(project_id)


def kill_project_processes(project_id: str) -> int:
    """Kill all active CLI subprocesses for a project. Returns number killed."""
    procs = _active_processes.pop(project_id, [])
    killed = 0
    for proc in procs:
        try:
            proc.kill()
            killed += 1
            logger.info(f"[stop] Killed subprocess pid={proc.pid} for project={project_id}")
        except Exception as e:
            logger.warning(f"[stop] Failed to kill pid={getattr(proc, 'pid', '?')}: {e}")
    return killed


@dataclass
class LLMResponse:
    content: str
    provider: str          # "cli" or "api"
    model: str
    latency_ms: float
    usage: Optional[dict] = None   # token counts (API mode only)
    thinking: Optional[str] = None  # extended thinking content (API mode only)


async def _call_cli_async(
    system_prompt: str,
    user_message: str,
    timeout: int,
    agent_name: str,
) -> LLMResponse:
    """
    Async CLI call — uses asyncio.create_subprocess_exec so the event loop
    stays free while the model streams tokens (can take several minutes for
    large outputs like full frontend codebases).
    """
    claude_path = shutil.which("claude")
    if not claude_path:
        raise RuntimeError(
            "Claude CLI not found in PATH. "
            "Install Claude Code or switch to API mode in Settings."
        )

    cmd = [
        claude_path,
        "-p",                        # print mode (non-interactive)
        "--output-format", "json",   # structured JSON output
        "--system-prompt", system_prompt,
        "--no-session-persistence",  # don't save session to disk
    ]

    # Strip ANTHROPIC_API_KEY so CLI uses the user's subscription, not the key.
    # Strip CLAUDECODE so the subprocess is not blocked by "nested session" check
    # (the agent-service may be started from within a Claude Code terminal).
    STRIP_KEYS = {"ANTHROPIC_API_KEY", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT",
                  "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING"}
    cli_env = {k: v for k, v in os.environ.items() if k not in STRIP_KEYS}

    logger.info(f"[{agent_name}] CLI call starting (timeout={timeout}s)")
    t0 = time.time()

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=cli_env,
    )

    # ── Register subprocess so /stop can kill it ──────────────────────────────
    project_id = _current_project_id.get()
    if project_id not in _active_processes:
        _active_processes[project_id] = []
    _active_processes[project_id].append(proc)
    # ─────────────────────────────────────────────────────────────────────────

    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(input=user_message.encode()),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError(
            f"Claude CLI timed out after {timeout}s for agent '{agent_name}'. "
            f"The prompt may be too large or the model is slow. "
            f"Try switching to API mode in Settings for faster, parallel generation."
        )
    finally:
        # Always deregister when done (success, timeout, or cancellation)
        try:
            _active_processes.get(project_id, []).remove(proc)
        except ValueError:
            pass  # already removed by kill_project_processes

    latency_ms = (time.time() - t0) * 1000
    returncode = proc.returncode

    if returncode != 0:
        stderr = stderr_bytes.decode(errors="replace")[:500] if stderr_bytes else "No error output"
        raise RuntimeError(f"Claude CLI returned exit code {returncode}: {stderr}")

    stdout = stdout_bytes.decode(errors="replace")

    # Parse the JSON output envelope
    try:
        output = json.loads(stdout)
    except json.JSONDecodeError:
        logger.warning(f"[{agent_name}] CLI output was not JSON, using raw text")
        return LLMResponse(
            content=stdout.strip(),
            provider="cli",
            model="claude-code",
            latency_ms=latency_ms,
        )

    if output.get("is_error"):
        raise RuntimeError(f"Claude CLI error: {output.get('result', 'Unknown error')}")

    content = output.get("result", "")
    logger.info(f"[{agent_name}] CLI call done in {latency_ms:.0f}ms")

    return LLMResponse(
        content=content,
        provider="cli",
        model=output.get("model", "claude-code"),
        latency_ms=latency_ms,
    )


def _call_cli(
    system_prompt: str,
    user_message: str,
    max_tokens: int,
    timeout: int,
    agent_name: str,
) -> LLMResponse:
    """
    Sync wrapper around the async CLI call.
    Runs in whatever event loop is active (LangGraph runs agents in a thread
    pool via run_in_executor, so we create a new loop if needed).
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an existing event loop (e.g. FastAPI/uvicorn).
            # Use run_until_complete is not safe here; schedule as a task instead
            # via a new thread-local event loop.
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(
                    asyncio.run,
                    _call_cli_async(system_prompt, user_message, timeout, agent_name),
                )
                return future.result(timeout=timeout + 10)
        else:
            return loop.run_until_complete(
                _call_cli_async(system_prompt, user_message, timeout, agent_name)
            )
    except RuntimeError:
        # No event loop at all — create one
        return asyncio.run(
            _call_cli_async(system_prompt, user_message, timeout, agent_name)
        )


def _call_api(
    system_prompt: str,
    user_message: str,
    model: str,
    max_tokens: int,
    timeout: int,
    agent_name: str,
    budget_tokens: int = 0,
) -> LLMResponse:
    """
    Call Claude via the Anthropic API using streaming.

    Streaming is required for requests that may take longer than 10 minutes
    (i.e. large max_tokens values).  We collect the full streamed response
    and return it as a single string, so callers don't need to change.

    If budget_tokens > 0, enables extended thinking — the model reasons
    internally before generating output, improving code quality.

    Retries automatically on overloaded_error (HTTP 529) with exponential backoff.
    """
    from anthropic import Anthropic, InternalServerError, APIStatusError
    import httpx

    client = Anthropic(timeout=httpx.Timeout(timeout=None, connect=30.0))

    # Retry delays for overloaded errors: 10s, 30s, 60s
    RETRY_DELAYS = [10, 30, 60]
    MAX_RETRIES = len(RETRY_DELAYS)

    use_thinking = budget_tokens > 0

    for attempt in range(MAX_RETRIES + 1):
        logger.info(
            f"[{agent_name}] API streaming call starting "
            f"(model={model}, max_tokens={max_tokens}, "
            f"thinking={'enabled' if use_thinking else 'disabled'}"
            f"{f', budget={budget_tokens}' if use_thinking else ''}, "
            f"attempt={attempt + 1})"
        )
        t0 = time.time()

        try:
            content_chunks: list[str] = []
            thinking_chunks: list[str] = []
            usage = None

            # Build kwargs
            stream_kwargs = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": user_message}],
            }

            if use_thinking:
                # Extended thinking: system prompt goes in messages, not top-level
                # Claude API requires system to be in user message for thinking mode
                stream_kwargs["thinking"] = {
                    "type": "enabled",
                    "budget_tokens": budget_tokens,
                }
                # When thinking is enabled, system prompt must be passed as top-level param
                stream_kwargs["system"] = system_prompt
            else:
                stream_kwargs["system"] = system_prompt

            with client.messages.stream(**stream_kwargs) as stream:
                if use_thinking:
                    # With thinking enabled, iterate over raw events to capture both
                    # thinking and text content blocks
                    for event in stream:
                        pass  # stream handles accumulation internally

                    final = stream.get_final_message()

                    # Extract thinking and text from content blocks
                    if final and final.content:
                        for block in final.content:
                            if block.type == "thinking":
                                thinking_chunks.append(block.thinking)
                            elif block.type == "text":
                                content_chunks.append(block.text)
                else:
                    for text in stream.text_stream:
                        content_chunks.append(text)

                    final = stream.get_final_message()

                if final and hasattr(final, "usage") and final.usage:
                    usage = {
                        "input_tokens": final.usage.input_tokens,
                        "output_tokens": final.usage.output_tokens,
                    }
                stop_reason = final.stop_reason if final else None

            content = "".join(content_chunks)
            thinking_text = "".join(thinking_chunks) if thinking_chunks else None
            latency_ms = (time.time() - t0) * 1000

            if stop_reason == "max_tokens":
                logger.warning(
                    f"[{agent_name}] Output TRUNCATED (hit max_tokens={max_tokens}). "
                    "Increase AGENT_MAX_TOKENS in config.py for this agent."
                )

            if thinking_text:
                logger.info(
                    f"[{agent_name}] Extended thinking: {len(thinking_text)} chars"
                )

            logger.info(f"[{agent_name}] API streaming call done in {latency_ms:.0f}ms (tokens: {usage}, stop={stop_reason})")

            return LLMResponse(
                content=content,
                provider="api",
                model=model,
                latency_ms=latency_ms,
                usage=usage,
                thinking=thinking_text,
            )

        except (InternalServerError, APIStatusError) as e:
            # Retry on overloaded_error (529) or other 5xx transient errors
            is_overloaded = (
                getattr(e, "status_code", 0) == 529
                or "overloaded_error" in str(e)
                or "overloaded" in str(e).lower()
            )
            if is_overloaded and attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt]
                logger.warning(
                    f"[{agent_name}] API overloaded (attempt {attempt + 1}/{MAX_RETRIES + 1}), "
                    f"retrying in {delay}s..."
                )
                time.sleep(delay)
                continue
            raise


def call_llm(
    system_prompt: str,
    user_message: str,
    agent_name: str = "default",
    llm_mode: Optional[str] = None,
    llm_model: Optional[str] = None,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    timeout: Optional[int] = None,
    budget_tokens: Optional[int] = None,
) -> LLMResponse:
    """
    Unified LLM call — routes to CLI or API based on llm_mode parameter.

    llm_mode and llm_model come from the user's frontend settings (per-request).
    No auto-fallback — if CLI fails, it fails. User must switch mode in Settings.

    budget_tokens: If set and > 0, enables extended thinking (API mode only).
    The model reasons internally before generating output, improving code quality.
    Ignored in CLI mode (not supported by subprocess).
    """
    from config import LLM_MODE, AGENT_MODELS, AGENT_MAX_TOKENS, AGENT_TIMEOUTS, AGENT_THINKING_BUDGET

    # Per-request mode overrides env default
    _mode = llm_mode or LLM_MODE
    # Model resolution (API mode only):
    #   sonnet selected → all agents use sonnet uniformly
    #   opus selected   → per-agent smart mix (heavy agents=opus, utility agents=sonnet)
    #   nothing sent    → fall back to per-agent AGENT_MODELS config
    if llm_model and "sonnet" in llm_model:
        _model = llm_model
    elif llm_model and "opus" in llm_model:
        _model = AGENT_MODELS.get(agent_name, llm_model)
    else:
        _model = model or AGENT_MODELS.get(agent_name, "claude-sonnet-4-6")
    _max_tokens = max_tokens or AGENT_MAX_TOKENS.get(agent_name, 4096)
    _timeout = timeout or AGENT_TIMEOUTS.get(agent_name, 120)
    _budget = budget_tokens if budget_tokens is not None else AGENT_THINKING_BUDGET.get(agent_name, 0)

    if _mode == "cli":
        return _call_cli(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=_max_tokens,
            timeout=_timeout,
            agent_name=agent_name,
        )
    else:
        # API mode
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise RuntimeError(
                "ANTHROPIC_API_KEY not set. Go to Settings and switch to CLI mode, "
                "or add your API key to .env.local"
            )
        return _call_api(
            system_prompt=system_prompt,
            user_message=user_message,
            model=_model,
            max_tokens=_max_tokens,
            timeout=_timeout,
            agent_name=agent_name,
            budget_tokens=_budget,
        )

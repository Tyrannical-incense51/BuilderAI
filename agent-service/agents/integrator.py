import time
from graph.state import BuilderState
from prompts.integrator_prompt import INTEGRATOR_SYSTEM, INTEGRATOR_USER
from utils.code_parser import parse_file_blocks
from utils.llm_provider import call_llm


def integrator_agent(state: BuilderState) -> BuilderState:
    """
    Integrator Agent: Merges frontend and backend files, fixes imports, connects components to APIs.
    """
    start_time = time.time()
    blueprint = state.get("blueprint", {})
    frontend_files = state.get("frontend_files", {}) or {}
    backend_files = state.get("backend_files", {}) or {}
    previous_files = state.get("previous_files") or {}

    all_files = {**previous_files, **frontend_files, **backend_files}

    def format_files(files: dict) -> str:
        if not files:
            return "(none)"
        return "\n\n".join([
            f"### {path}\n```\n{content}\n```"
            for path, content in files.items()
        ])

    user_message = INTEGRATOR_USER.format(
        blueprint=str(blueprint),
        frontend_files_summary=format_files(frontend_files),
        backend_files_summary=format_files(backend_files),
    )

    if previous_files:
        user_message += (
            "\n\n--- ITERATION CONTEXT ---\n"
            "IMPORTANT: This is an ITERATION on an existing app. "
            f"There are {len(previous_files)} files from the previous build. "
            "The frontend and backend agents have already merged their changes. "
            "Focus on fixing imports and connections for the CHANGED files. "
            "EXCEPTION: If QA flagged any file as truncated or incomplete, rewrite that file COMPLETELY from scratch.\n"
        )

    # QA remediation context
    qa_feedback = state.get("qa_feedback")
    if qa_feedback and qa_feedback.get("failed_agent") not in ("frontend", "backend"):
        issues = qa_feedback.get("issues", [])[:10]
        issue_lines = "\n".join([f"- [{i.get('severity','').upper()}] {i.get('description','')}" for i in issues])
        user_message += (
            "\n\n--- QA REMEDIATION REQUIRED ---\n"
            "The previous build failed QA review. Fix these critical integration issues:\n"
            f"{issue_lines}\n"
        )

    try:
        llm_response = call_llm(
            system_prompt=INTEGRATOR_SYSTEM,
            user_message=user_message,
            agent_name="integrator",
            llm_mode=state.get("llm_mode"),
            llm_model=state.get("llm_model"),
        )

        raw_output = llm_response.content
        integrated_updates = parse_file_blocks(raw_output)

        integrated_files = {**all_files, **integrated_updates}

        duration_ms = int((time.time() - start_time) * 1000)
        total_files = len(integrated_files)
        updated_files = len(integrated_updates)

        events = [
            {
                "type": "agent_complete",
                "agent": "integrator",
                "message": f"Integrated {total_files} files, fixed {updated_files} issues",
                "duration_ms": duration_ms,
            },
            {
                "type": "text",
                "content": f"Integrator Agent assembled **{total_files} total files** and fixed **{updated_files} files** with import/connection fixes.\n",
            },
            {
                "type": "files_update",
                "files": integrated_files,
            },
        ]
        if llm_response.usage:
            input_t = llm_response.usage.get("input_tokens", 0)
            output_t = llm_response.usage.get("output_tokens", 0)
            events.append({
                "type": "usage",
                "agent": "integrator",
                "input_tokens": input_t,
                "output_tokens": output_t,
                "cost_usd": round((input_t * 3.0 + output_t * 15.0) / 1_000_000, 6),
            })

        return {
            **state,
            "integrated_files": integrated_files,
            "events": events,
        }
    except Exception as e:
        combined = {**previous_files, **frontend_files, **backend_files}
        return {
            **state,
            "integrated_files": combined,
            "errors": [f"Integrator error: {str(e)}"],
            "events": [
                {
                    "type": "agent_error",
                    "agent": "integrator",
                    "message": f"Integration had issues: {str(e)}. Passing through combined files.",
                }
            ],
        }

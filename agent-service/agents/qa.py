import json
import logging
import time
from graph.state import BuilderState

logger = logging.getLogger(__name__)
from prompts.qa_prompt import QA_SYSTEM, QA_USER
from utils.code_parser import extract_json_block
from utils.llm_provider import call_llm


def qa_agent(state: BuilderState) -> BuilderState:
    """
    QA Agent: Reviews integrated code for bugs and quality issues.
    Can route back to frontend/backend/integrator on failure (max 3 retries).
    """
    start_time = time.time()
    blueprint = state.get("blueprint", {})
    integrated_files = state.get("integrated_files", {}) or {}
    retry_count = state.get("retry_count", 0)

    # Prioritize critical files so they're always included
    priority_files = {k: v for k, v in integrated_files.items()
        if k in ('app/page.tsx', 'app/layout.tsx') or k.startswith('app/api/') or k.endswith('route.ts')}
    other_files = {k: v for k, v in integrated_files.items() if k not in priority_files}
    files_for_review = list(priority_files.items()) + list(other_files.items())[:max(0, 12 - len(priority_files))]

    CONTINUES = "\n[...FILE CONTINUES - excerpt only, NOT truncated...]"
    TRUNCATE = 1500
    files_summary = "\n\n".join([
        f"### {path}\n```\n{content[:TRUNCATE] + CONTINUES if len(content) > TRUNCATE else content}\n```"
        for path, content in files_for_review
    ])

    user_message = QA_USER.format(
        blueprint=str(blueprint),
        files_summary=files_summary,
    )

    try:
        llm_response = call_llm(
            system_prompt=QA_SYSTEM,
            user_message=user_message,
            agent_name="qa",
            llm_mode=state.get("llm_mode"),
            llm_model=state.get("llm_model"),
        )

        raw_output = llm_response.content
        logger.info(
            "[qa] LLM I/O sizes — input: %d chars, output: %d chars",
            len(user_message), len(raw_output)
        )
        json_str = extract_json_block(raw_output)
        try:
            qa_result = json.loads(json_str)
        except json.JSONDecodeError as parse_err:
            raise ValueError(
                f"QA agent produced invalid JSON. Parse error: {parse_err}. "
                f"Raw output (first 300 chars): {raw_output[:300]}"
            ) from parse_err

        duration_ms = int((time.time() - start_time) * 1000)
        passed = qa_result.get("passed", False)
        score = qa_result.get("score", 0)
        issues = qa_result.get("issues", [])

        events = [
            {
                "type": "agent_complete",
                "agent": "qa",
                "message": f"Review {'passed' if passed else 'failed'} — score: {score}/100, {len(issues)} issues found",
                "duration_ms": duration_ms,
            }
        ]

        if passed:
            events.append({
                "type": "text",
                "content": f"QA Agent approved the code with a score of **{score}/100**. {len(issues)} minor issues noted.\n",
            })
        else:
            issue_list = '\n'.join([f"- [{i.get('severity', 'info').upper()}] {i.get('description', '')}" for i in issues[:5]])
            events.append({
                "type": "text",
                "content": f"QA Agent found issues (score: {score}/100). Routing back for fixes...\n\nIssues:\n{issue_list}\n",
            })

        if llm_response.usage:
            input_t = llm_response.usage.get("input_tokens", 0)
            output_t = llm_response.usage.get("output_tokens", 0)
            events.append({
                "type": "usage",
                "agent": "qa",
                "input_tokens": input_t,
                "output_tokens": output_t,
                "cost_usd": round((input_t * 3.0 + output_t * 15.0) / 1_000_000, 6),
            })

        return {
            **state,
            "qa_result": qa_result,
            "retry_count": retry_count,
            "events": events,
        }

    except Exception as e:
        error_msg = str(e)
        return {
            **state,
            "qa_result": {
                "passed": False,
                "score": 0,
                "qa_skipped": True,
                "issues": [{"severity": "critical", "description": f"QA agent failed to execute: {error_msg}"}],
                "failed_agent": None,
                "summary": f"QA review could not be completed: {error_msg}",
            },
            "errors": [f"QA error: {error_msg}"],
            "events": [
                {
                    "type": "agent_error",
                    "agent": "qa",
                    "message": f"QA review failed (code will still be packaged after retries): {error_msg}",
                }
            ],
        }

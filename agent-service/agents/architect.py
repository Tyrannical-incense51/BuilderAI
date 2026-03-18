import json
import logging
import time
from graph.state import BuilderState
from prompts.architect_prompt import ARCHITECT_SYSTEM, ARCHITECT_USER
from utils.code_parser import extract_json_block
from utils.llm_provider import call_llm

logger = logging.getLogger(__name__)


def architect_agent(state: BuilderState) -> BuilderState:
    """
    Architect Agent: Receives user prompt and produces a structured app blueprint.
    Runs first in the pipeline.
    """
    start_time = time.time()
    
    # Format conversation history
    history_str = "\n".join([
        f"{msg['role'].upper()}: {msg['content']}"
        for msg in state.get("conversation_history", [])[-6:]  # Last 6 messages
    ]) or "No prior conversation."
    
    user_message = ARCHITECT_USER.format(
        user_prompt=state["user_prompt"],
        conversation_history=history_str,
    )

    # Iteration mode: if we have a previous blueprint, tell the architect to iterate
    prev_blueprint = state.get("previous_blueprint")
    if prev_blueprint:
        import json as _json
        user_message += (
            "\n\n--- ITERATION CONTEXT ---\n"
            "IMPORTANT: The user is ITERATING on an existing app. Here is the PREVIOUS BLUEPRINT:\n"
            f"{_json.dumps(prev_blueprint, indent=2)}\n\n"
            "The user's new message describes CHANGES they want. You must:\n"
            "1. Keep the existing blueprint structure intact\n"
            "2. Only modify the parts the user asked to change\n"
            "3. Add new pages/components if requested, but preserve existing ones\n"
            "4. Return a COMPLETE updated blueprint (not just the diff)\n"
        )
    
    try:
        llm_response = call_llm(
            system_prompt=ARCHITECT_SYSTEM,
            user_message=user_message,
            agent_name="architect",
            llm_mode=state.get("llm_mode"),
            llm_model=state.get("llm_model"),
        )

        raw_output = llm_response.content
        logger.info(
            "[architect] LLM I/O sizes — input: %d chars, output: %d chars",
            len(user_message), len(raw_output)
        )
        json_str = extract_json_block(raw_output)
        try:
            blueprint = json.loads(json_str)
        except json.JSONDecodeError as parse_err:
            raise ValueError(
                f"Architect produced invalid JSON. Parse error: {parse_err}. "
                f"Raw output (first 500 chars): {raw_output[:500]}"
            ) from parse_err
        
        duration_ms = int((time.time() - start_time) * 1000)

        events = [
            {
                "type": "agent_complete",
                "agent": "architect",
                "message": f"Blueprint created: {blueprint.get('app_name', 'App')} — {len(blueprint.get('pages', []))} pages, {len(blueprint.get('components', []))} components",
                "duration_ms": duration_ms,
            },
            {
                "type": "text",
                "content": f"Architect Agent has designed your app.\n\n**{blueprint.get('app_name')}**: {blueprint.get('description')}\n\n**Pages:** {', '.join(p.get('path', p.get('name', '/')) for p in blueprint.get('pages', []))}\n**Storage:** {blueprint.get('storage', 'localstorage')}\n",
            },
        ]
        if llm_response.usage:
            input_t = llm_response.usage.get("input_tokens", 0)
            output_t = llm_response.usage.get("output_tokens", 0)
            events.append({
                "type": "usage",
                "agent": "architect",
                "input_tokens": input_t,
                "output_tokens": output_t,
                "cost_usd": round((input_t * 3.0 + output_t * 15.0) / 1_000_000, 6),
            })

        return {
            **state,
            "blueprint": blueprint,
            "current_agent": "frontend",
            "events": events,
        }
    except Exception as e:
        return {
            **state,
            "current_agent": "architect",
            "errors": [f"Architect error: {str(e)}"],
            "events": [
                {
                    "type": "agent_error",
                    "agent": "architect",
                    "message": f"Failed to create blueprint: {str(e)}",
                }
            ],
        }

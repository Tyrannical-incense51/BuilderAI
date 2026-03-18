"""
Iterate Agent: Apply a small targeted change to an existing project.
Returns only the files that changed — not the full codebase.
Much cheaper than a full pipeline run (~$0.02-0.10 vs ~$0.70).
"""

from typing import Optional
from utils.llm_provider import call_llm
from utils.code_parser import parse_file_blocks
from prompts.iterate_prompt import ITERATE_SYSTEM, build_iterate_user


def iterate_files(
    prompt: str,
    current_files: dict,
    llm_mode: str,
    llm_model: Optional[str],
) -> dict:
    """
    Apply a small change to an existing project.
    Returns dict of {path: new_content} for only the changed files.
    """
    user_msg = build_iterate_user(prompt, current_files)
    resp = call_llm(
        system_prompt=ITERATE_SYSTEM,
        user_message=user_msg,
        agent_name="iterate",
        llm_mode=llm_mode,
        llm_model=llm_model,
        max_tokens=32000,
        timeout=180,
    )
    changed_files = parse_file_blocks(resp.content)
    return changed_files

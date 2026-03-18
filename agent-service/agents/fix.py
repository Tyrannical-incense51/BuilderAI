"""
Fix Agent: Given a single broken file and its build error, returns the corrected file content.

Used by the /fix endpoint for surgical preview repair — no full pipeline re-run needed.
"""

import re
from typing import Optional
from utils.llm_provider import call_llm
from utils.code_parser import strip_prose_from_content
from prompts.fix_prompt import FIX_SYSTEM, build_fix_user


def fix_file(
    error_message: str,
    file_path: str,
    file_content: str,
    related_files: dict,
    llm_mode: str,
    llm_model: Optional[str],
) -> str:
    """
    Call LLM to fix a single broken file. Returns the corrected file content.
    Strips markdown fences if the model wraps its output.
    """
    user_msg = build_fix_user(error_message, file_path, file_content, related_files)
    resp = call_llm(
        system_prompt=FIX_SYSTEM,
        user_message=user_msg,
        agent_name="fix",
        llm_mode=llm_mode,
        llm_model=llm_model,
        max_tokens=16000,
        timeout=90,
    )
    content = resp.content.strip()

    # Strategy 1: extract code from a fenced block anywhere in the response.
    # The model sometimes wraps its output even when told not to, or puts prose
    # before/after a code fence.  Grabbing the fence content is always safer.
    fence_match = re.search(r'```(?:[a-zA-Z0-9_+:-]*)?\n([\s\S]*?)\n?```', content)
    if fence_match:
        return fence_match.group(1).strip()

    # Strategy 2: strip any lone opening/closing fence lines the old regex handled.
    content = re.sub(r'^```[a-zA-Z0-9_+:-]*\n?', '', content)
    content = re.sub(r'\n?```$', '', content)

    # Strategy 3: remove leading/trailing prose lines (English sentences that
    # sneak in when the model explains the fix instead of just returning code).
    content = strip_prose_from_content(content)

    return content.strip()

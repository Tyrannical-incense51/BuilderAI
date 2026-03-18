"""
Repair Agent: Detects and fixes truncated TypeScript/React/CSS files.

Two passes:
  1. repair_truncated_files  — runs after frontend generation, operates on frontend_files
  2. repair_integrated_files — runs after integrator, operates on integrated_files

Detection is pure Python (free). Each repair calls LLM with only the last 60 lines
of the truncated file and asks for ONLY the missing closing code — not a full rewrite.
"""

import re
import time
from graph.state import BuilderState
from utils.llm_provider import call_llm


REPAIR_SYSTEM = """You are completing a truncated TypeScript/React or CSS file.
Output ONLY the missing code to properly close/complete the file.
Do NOT rewrite or repeat what's already there. Just the continuation from where it cuts off.
For TS/TSX: close all open functions, JSX tags, and the export default statement.
For CSS: close any open rules and add the final closing brace if missing."""


def is_truncated(content: str, path: str = '') -> bool:
    """
    Heuristic to detect truncated files. Checks multiple signals:
    - Short alpha-only last line (partial word like 'u', 'key', 'Java')
    - Last line ends mid-expression (=, ={, (, etc.)
    - CSS file doesn't end with } or ;
    - TS/TSX has unmatched braces/parens
    - Last line lacks a valid statement terminator
    """
    lines = [l for l in content.strip().split('\n') if l.strip()]
    if not lines:
        return False

    last = lines[-1].strip()

    # Short alpha-only ending = partial word ('u', 'key', 'use', 'Java', 'setState', etc.)
    if len(last) <= 5 and last.replace('_', '').replace('-', '').isalpha():
        return True

    # Ends mid-expression (open operator or attribute)
    if last.endswith(('=', '={', '(', ',', '+', '&&', '||', '?', ':', '[', '<')):
        return True

    # CSS-specific: valid files end with } or ;
    if path.endswith('.css'):
        return not any(last.endswith(c) for c in ['}', ';'])

    # TS/TSX: check unmatched braces/parens (allow small imbalance from JSX)
    open_braces = content.count('{') - content.count('}')
    open_parens = content.count('(') - content.count(')')
    if open_braces > 2 or open_parens > 2:
        return True

    # Last line must end with a valid statement terminator
    if not any(last.endswith(c) for c in ['}', ')', ';', '>', '"', "'", ']']):
        return True

    # Opening JSX tag at end of file = truncated mid-JSX.
    # Valid: ends with /> (self-closing) or </tag> (closing). Plain <tag ...> = truncated.
    if last.endswith('>') and not last.endswith('/>') and not re.search(r'</\w', last):
        return True

    return False


# Strips Tailwind placeholder background-url classes where the URL is literally dots (LLM artifact).
# These cause Next.js to treat the dots as a file module path → build crash.
_PLACEHOLDER_BG_RE = re.compile(r'''\s*bg-\[url\(['"]\.{1,3}['"]\)\]''')

# Matches bg-[url('data:image/svg+xml,...')] containing unencoded double-quotes inside.
# Inner " characters close the JSX className="..." attribute → SWC parse error.
_SVG_DOUBLEQUOTE_BG_RE = re.compile(r"""bg-\[url\('data:image/svg\+xml,[^']*"[^']*'\)\]""")


def sanitize_placeholder_classes(files: dict) -> dict:
    """
    Strip two categories of broken Tailwind bg-[url(...)] patterns from all source files.
    This runs in Python (never scanned by Tailwind's content glob) so the patterns
    can be written as plain strings without risk of contaminating the Next.js build.
    """
    result = {}
    for path, content in files.items():
        if not path.endswith(('.tsx', '.jsx', '.ts', '.css')):
            result[path] = content
            continue
        fixed = _PLACEHOLDER_BG_RE.sub('', content)
        fixed = _SVG_DOUBLEQUOTE_BG_RE.sub('bg-transparent', fixed)
        result[path] = fixed
    return result


def _repair_files(files: dict, state: BuilderState) -> tuple[dict, list]:
    """Shared repair logic. Returns (repaired_files, events)."""
    repaired = dict(files)
    repairs_made = 0
    repair_names = []

    for path, content in files.items():
        if not path.endswith(('.tsx', '.ts', '.css')):
            continue
        if not is_truncated(content, path):
            continue

        lines = content.split('\n')
        tail = '\n'.join(lines[-60:]) if len(lines) > 60 else content
        lang = 'css' if path.endswith('.css') else 'tsx'
        user_msg = (
            f"File: {path}\n\n"
            f"End of truncated file:\n```{lang}\n{tail}\n```\n\n"
            "Output ONLY the missing closing code to complete this file:"
        )

        try:
            resp = call_llm(
                system_prompt=REPAIR_SYSTEM,
                user_message=user_msg,
                agent_name="repair",
                llm_mode=state.get("llm_mode"),
                llm_model=state.get("llm_model"),
                max_tokens=4000,
                timeout=120,
            )
            completion = resp.content.strip()
            # Strategy 1: extract code from any fenced block in the response
            fence_match = re.search(r'```(?:[a-zA-Z0-9_+:-]*)?\n([\s\S]*?)\n?```', completion)
            if fence_match:
                completion = fence_match.group(1).strip()
            else:
                # Strategy 2: strip lone fence lines
                completion = re.sub(r'^```[a-zA-Z0-9_+:-]*\n?', '', completion)
                completion = re.sub(r'\n?```$', '', completion)

            # Validate the combined result before accepting
            combined = content.rstrip() + '\n' + completion
            combined_braces = combined.count('{') - combined.count('}')
            combined_parens = combined.count('(') - combined.count(')')

            if abs(combined_braces) <= 2 and abs(combined_parens) <= 2:
                # Repair looks good — braces are balanced
                repaired[path] = combined
                repairs_made += 1
                repair_names.append(path.split('/')[-1])
            else:
                # Repair didn't fix the balancing issue — try simple brace closing
                if combined_braces > 0:
                    combined = combined.rstrip() + '\n' + '}\n' * combined_braces
                if combined_parens > 0:
                    combined = combined.rstrip() + '\n' + ')\n' * combined_parens
                repaired[path] = combined
                repairs_made += 1
                repair_names.append(path.split('/')[-1] + ' (auto-closed)')
        except Exception as e:
            # Log the error instead of silently swallowing
            import logging
            logging.getLogger(__name__).warning(
                f"[repair] Failed to repair {path}: {e}"
            )

    # Always sanitize placeholder Tailwind bg-[url] classes — zero LLM cost,
    # prevents "Module not found: Can't resolve '...'" and SWC parse errors.
    repaired = sanitize_placeholder_classes(repaired)

    events = []
    if repairs_made:
        names = ', '.join(repair_names)
        events.append({
            "type": "agent_complete",
            "agent": "repair",
            "message": f"Repaired {repairs_made} truncated file(s): {names}",
        })

    return repaired, events


def repair_truncated_files(state: BuilderState) -> BuilderState:
    """
    Pass 1: Scan frontend_files for truncated .tsx/.ts/.css files after frontend generation.
    """
    frontend_files = state.get("frontend_files") or {}
    if not frontend_files:
        return state

    repaired, events = _repair_files(frontend_files, state)
    return {**state, "frontend_files": repaired, "events": events}


def repair_integrated_files(state: BuilderState) -> BuilderState:
    """
    Pass 2: Scan integrated_files for truncated files after integrator runs.
    The integrator itself can truncate when processing many files at 60k tokens.
    """
    integrated_files = state.get("integrated_files") or {}
    if not integrated_files:
        return state

    repaired, events = _repair_files(integrated_files, state)
    return {**state, "integrated_files": repaired, "events": events}

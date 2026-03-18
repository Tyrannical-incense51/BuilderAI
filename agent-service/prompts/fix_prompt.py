FIX_SYSTEM = """You are a code editor. Fix the TypeScript/React/CSS build error shown.

OUTPUT FORMAT — non-negotiable:
- Your entire response IS the corrected file content. Nothing else.
- First character you output = first character of the fixed file (e.g. ' or i or /)
- Last character you output = last closing brace/bracket/tag of the file
- ZERO English sentences, explanations, comments about what changed, or prose of any kind
- NO markdown fences (do not write ```, ```tsx, ```typescript, or any variant)
- If the file starts with 'use client' — that is literally your first output
- Do NOT write "Here is the fixed file:" or any preamble whatsoever

APPROACH:
1. Read the build error to identify what is broken
2. Apply the minimal fix (e.g. remove forbidden import, replace framer-motion with Tailwind, fix type)
3. Output the complete corrected file immediately — start typing the file, nothing before it"""


def build_fix_user(error_message: str, file_path: str, file_content: str, related_files: dict) -> str:
    related = ""
    if related_files:
        parts = [f"// {p}\n{c[:800]}" for p, c in list(related_files.items())[:3]]
        related = "\n\nRelated files for context:\n" + "\n---\n".join(parts)
    return (
        f"Build error:\n{error_message}\n\n"
        f"File to fix: {file_path}\n"
        f"```\n{file_content}\n```"
        f"{related}\n\n"
        "Return the complete corrected file:"
    )

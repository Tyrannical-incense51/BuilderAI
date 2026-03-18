import re
import os
from typing import Dict, Optional


def _sanitize_path(raw_path: str) -> Optional[str]:
    """
    Sanitize a file path from LLM output to prevent path traversal attacks.
    Returns the clean path, or None if the path is invalid/dangerous.
    """
    # Strip leading slashes and dots
    path = raw_path.strip().lstrip('/')
    # Normalize: resolve any .. or . components
    normalized = os.path.normpath(path)
    # Reject anything that escapes the project root after normalization
    if normalized.startswith('..') or os.path.isabs(normalized):
        return None
    # Reject suspiciously short or extensionless bare names (not paths)
    if len(normalized) < 3 or ('.' not in normalized and '/' not in normalized):
        return None
    return normalized


def _strip_reasoning_blocks(text: str) -> str:
    """
    Remove <PLAN>...</PLAN>, <VERIFY>...</VERIFY>, and CORRECTION: blocks
    BEFORE extracting file blocks. This prevents code examples inside
    reasoning blocks from being mistakenly extracted as project files.
    """
    # Remove PLAN blocks (may contain code examples)
    text = re.sub(r'<PLAN>.*?</PLAN>', '', text, flags=re.DOTALL)
    # Remove VERIFY blocks (may contain code examples)
    text = re.sub(r'<VERIFY>.*?</VERIFY>', '', text, flags=re.DOTALL)
    return text


def parse_file_blocks(text: str) -> Dict[str, str]:
    """
    Parse code blocks with file path annotations from LLM output.

    Supports formats:
      ```tsx:app/page.tsx
      ...code...
      ```

      ```python:agents/main.py
      ...code...
      ```

    IMPORTANT: Strips <PLAN> and <VERIFY> reasoning blocks before extraction
    to prevent phantom files from code examples inside reasoning.
    """
    files: Dict[str, str] = {}

    # Strip reasoning blocks FIRST to avoid extracting code examples inside them
    clean_text = _strip_reasoning_blocks(text)

    # Pattern: ```language:path/to/file.ext or ```path/to/file.ext
    pattern = re.compile(
        r'```(?:[a-zA-Z0-9_+-]*:)?([^\n`]+)\n(.*?)```',
        re.DOTALL
    )

    for match in pattern.finditer(clean_text):
        raw_path = match.group(1).strip()
        content = match.group(2)
        clean_path = _sanitize_path(raw_path)
        if clean_path:
            files[clean_path] = content

    # Also try the format: // FILE: path/to/file.ext
    file_header_pattern = re.compile(
        r'//\s*FILE:\s*([^\n]+)\n```[^\n]*\n(.*?)```',
        re.DOTALL
    )
    for match in file_header_pattern.finditer(clean_text):
        raw_path = match.group(1).strip()
        content = match.group(2)
        clean_path = _sanitize_path(raw_path)
        if clean_path:
            files[clean_path] = content

    return files


def _repair_json(s: str) -> str:
    """
    Attempt to fix common JSON issues from LLM output:
      - invalid backslash escape sequences (e.g. \s, \e, \c from code snippets in descriptions)
      - trailing commas before } or ]
      - single-line // comments
      - missing commas between "value"\n"key" or }\n{ or ]\n[ patterns
    """
    # Fix invalid JSON escape sequences first.
    # Valid escapes: \" \\ \/ \b \f \n \r \t \uXXXX
    # LLMs put code snippets / regex / Windows paths in description strings, producing e.g. \s \e \p
    s = re.sub(r'\\([^"\\/bfnrtu\n])', r'\\\\\1', s)
    # Remove single-line comments (// ...) that aren't inside strings
    s = re.sub(r'(?m)^\s*//.*$', '', s)
    # Remove trailing commas before } or ]
    s = re.sub(r',\s*([\]}])', r'\1', s)
    # Insert missing commas: ".."\n  "  or  ".."\n  {  or  }\n  "  or  }\n  {  or  ]\n  [  etc.
    s = re.sub(r'(")\s*\n(\s*")', r'\1,\n\2', s)
    s = re.sub(r'(")\s*\n(\s*\{)', r'\1,\n\2', s)
    s = re.sub(r'(")\s*\n(\s*\[)', r'\1,\n\2', s)
    s = re.sub(r'(\})\s*\n(\s*")', r'\1,\n\2', s)
    s = re.sub(r'(\})\s*\n(\s*\{)', r'\1,\n\2', s)
    s = re.sub(r'(\])\s*\n(\s*")', r'\1,\n\2', s)
    s = re.sub(r'(\])\s*\n(\s*\{)', r'\1,\n\2', s)
    s = re.sub(r'(\])\s*\n(\s*\[)', r'\1,\n\2', s)
    # number/bool/null followed by newline + "key"
    s = re.sub(r'(\d|true|false|null)\s*\n(\s*")', r'\1,\n\2', s)
    # Remove any double commas we may have introduced
    s = re.sub(r',\s*,', ',', s)
    # Remove trailing commas again (in case repair added some before ])
    s = re.sub(r',\s*([\]}])', r'\1', s)
    return s


def extract_json_block(text: str) -> str:
    """Extract JSON from a markdown code block, with auto-repair."""
    import json as _json

    stripped = text.strip()

    # Fast path: the LLM output is already raw JSON (no markdown wrapper).
    # Try this BEFORE the code-block regex so that backticks INSIDE JSON string
    # values (e.g. "description": "A blog with ```markdown``` support") are never
    # mistakenly matched as markdown fences — which would extract garbage and fail
    # at json.loads() with "Expecting value: line 1 column 1 (char 0)".
    try:
        _json.loads(stripped)
        return stripped
    except _json.JSONDecodeError:
        pass

    # Try repair on the raw text before attempting code-block extraction.
    repaired_raw = _repair_json(stripped)
    try:
        _json.loads(repaired_raw)
        return repaired_raw
    except _json.JSONDecodeError:
        pass

    # Fall back: LLM may have wrapped JSON in a ``` code block.
    pattern = re.compile(r'```(?:json)?\s*\n?([\s\S]*?)\n?```')
    match = pattern.search(text)
    if match:
        raw = match.group(1).strip()
    else:
        # Try to find a raw JSON object anywhere in the text
        json_pattern = re.compile(r'\{[\s\S]*\}')
        match = json_pattern.search(text)
        raw = match.group(0) if match else stripped

    # Try extracted block as-is
    try:
        _json.loads(raw)
        return raw
    except _json.JSONDecodeError:
        pass

    # Repair and return best-effort result
    repaired = _repair_json(raw)
    try:
        _json.loads(repaired)
        return repaired
    except _json.JSONDecodeError:
        # Caller will raise a clear error with the raw_output context
        return repaired


# Tokens that unambiguously start a line of code (not English prose).
_CODE_STARTERS = (
    "'use client'", '"use client"', "'use server'", '"use server"',
    'import ', 'export ', 'const ', 'let ', 'var ', 'function ', 'async ',
    'class ', 'type ', 'interface ', 'enum ', 'declare ', 'namespace ',
    'return ', 'if ', 'else', 'for ', 'while ', 'switch ', 'try ', 'catch ',
    'throw ', 'new ', 'await ', 'yield ',
    '//', '/*', '/**', '*/', '<!--', '-->',
    '#!', '---',
    '{', '}', '(', ')', '[', ']', '</', '<',
    '@', '.', ':root', ':host', ':global',
    'module.exports', 'exports.',
)
_CODE_PUNCT = frozenset('{}()[]<>=;+*|&!@#%^~`\\')


def _is_code_line(line: str) -> bool:
    """Return True if a line looks like code rather than English prose."""
    s = line.strip()
    if not s:
        return True  # blank lines are neutral
    if any(s.startswith(t) for t in _CODE_STARTERS):
        return True
    # High density of code-punctuation → code
    if sum(1 for c in s if c in _CODE_PUNCT) >= 2:
        return True
    # Starts with a quote, digit, or brace → data literal or code
    if s[0] in ('"', "'", '`', '{', '[', '-') and len(s) > 1:
        return True
    return False


def strip_prose_from_content(content: str) -> str:
    """
    Remove lines that are clearly English prose from a code file's content.

    Called after LLM output is extracted to clean up cases where the model
    outputs explanatory text mixed with (or instead of) code.  Finds the
    first and last code-like line and returns only that range.
    """
    lines = content.split('\n')

    # Find first code-like line
    start = 0
    for i, line in enumerate(lines):
        if _is_code_line(line):
            start = i
            break

    # Find last code-like line
    end = len(lines)
    for i in range(len(lines) - 1, start - 1, -1):
        if _is_code_line(lines[i]):
            end = i + 1
            break

    return '\n'.join(lines[start:end])


def extract_plan_block(text: str) -> Optional[str]:
    """Extract <PLAN>...</PLAN> block from LLM output.

    The PLAN block contains the agent's reasoning about file structure,
    dependency graph, state architecture, and 'use client' analysis
    BEFORE generating any code.
    """
    match = re.search(r'<PLAN>\s*(.*?)\s*</PLAN>', text, re.DOTALL)
    return match.group(1).strip() if match else None


def extract_verify_block(text: str) -> Optional[str]:
    """Extract <VERIFY>...</VERIFY> block from LLM output.

    The VERIFY block contains the agent's self-check AFTER generating code:
    import resolution, directive audit, syntax audit, completeness check.
    """
    match = re.search(r'<VERIFY>\s*(.*?)\s*</VERIFY>', text, re.DOTALL)
    return match.group(1).strip() if match else None


def validate_typescript(content: str) -> list[str]:
    """Basic TypeScript validation - check for common issues."""
    issues = []
    
    if "import" in content:
        # Check for missing semicolons on imports (basic check)
        import_lines = re.findall(r'^import .+$', content, re.MULTILINE)
        for line in import_lines:
            if not line.strip().endswith(';') and not line.strip().endswith(','):
                issues.append(f"Missing semicolon: {line[:60]}")
    
    # Check for unclosed brackets (basic)
    opens = content.count('{')
    closes = content.count('}')
    if abs(opens - closes) > 2:
        issues.append(f"Possible unclosed brackets: {{ count={opens}, }} count={closes}")
    
    return issues

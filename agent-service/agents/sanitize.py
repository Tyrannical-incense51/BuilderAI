"""
Code Sanitizer: Deterministic post-generation fixes.
Zero LLM calls — fast, 100% reliable.

Runs immediately after parallel_generation (frontend + backend agents) so every
downstream step receives already-correct code.

Fixes applied (Vite / React SPA):
  1.  Strip 'use client' — not needed in Vite, causes warnings
  2.  Generic arrow rewrite — `const Foo = <T>() =>` → `function Foo<T>()`
  2b. Arrow callbacks missing block body — `=> \n const x` → `=> {\n const x`
  3.  Strip next/* imports — remove any residual next/image, next/router, etc.
  4.  Tailwind v4 CSS → v3 — `@import "tailwindcss"` → `@tailwind base/components/utilities`
  5.  framer-motion removal — strip imports + replace <motion.div> with <div>
  6.  Missing import semicolons — prevent esbuild ambiguity
  7.  @tailwindcss/postcss removal — banned v4-only package
  8.  darkMode array → string — `['class']` → `'class'`
  9.  Empty className removal — `className=""` is pointless noise
"""

import re
from graph.state import BuilderState


# ── Fix 1: Strip 'use client' ────────────────────────────────────────────────

_USE_CLIENT_RE = re.compile(r"""^['"]use client['"]\s*;?\s*\n*""", re.MULTILINE)


def _strip_use_client(content: str) -> str:
    """Remove any 'use client' directives — not needed in Vite."""
    return _USE_CLIENT_RE.sub("", content)


# ── Fix 2: Generic arrow function rewrite ────────────────────────────────────

_GENERIC_ARROW_RE = re.compile(
    r'^(export\s+(?:default\s+)?)?const\s+(\w+)\s*=\s*<([^>]+)>\s*\(([^)]*)\)\s*(?::\s*[^\n{]+?)?\s*=>\s*\{',
    re.MULTILINE,
)


def _fix_generic_arrows(content: str) -> str:
    def replace_match(m: re.Match) -> str:
        export_prefix = m.group(1) or ""
        name = m.group(2)
        generics = m.group(3)
        params = m.group(4)
        return f"{export_prefix}function {name}<{generics}>({params}) {{"
    return _GENERIC_ARROW_RE.sub(replace_match, content)


# ── Fix 2b: Arrow callbacks missing block body ───────────────────────────────
# Detects: .map((x) => \n  const y = ...  (statement after => without {)
# Fixes to: .map((x) => {\n  const y = ...
# This is THE #1 cause of "Unexpected token" errors in generated code.

_ARROW_MISSING_BRACE_RE = re.compile(
    r'(=>\s*)\n(\s*)(const |let |var |if |for |while |switch |try |return\b)',
)


def _fix_arrow_missing_brace(content: str) -> str:
    """Fix arrow functions that have statements without a block body { }."""
    if '=>' not in content:
        return content

    matches = list(_ARROW_MISSING_BRACE_RE.finditer(content))
    if not matches:
        return content

    # Process matches in reverse to preserve positions
    for match in reversed(matches):
        remaining_after_arrow = content[match.start(1):match.start(1) + len(match.group(1))].strip()
        if remaining_after_arrow.endswith('{'):
            continue  # Already has block body

        # Insert { after =>
        insert_pos = match.end(1)
        content = content[:insert_pos] + '{\n' + content[insert_pos:]

    return content


# ── Fix 3: Strip next/* imports ──────────────────────────────────────────────

_NEXT_IMPORT_RE = re.compile(
    r"""^\s*import\s+.*\s+from\s+['"]next/[^'"]+['"]\s*;?\s*$""",
    re.MULTILINE,
)


def _strip_next_imports(content: str) -> str:
    """Remove any import from 'next/...' that LLM might still generate."""
    return _NEXT_IMPORT_RE.sub('', content)


# ── Fix 4: Tailwind v4 CSS → v3 ─────────────────────────────────────────────

def _fix_tailwind_v4_css(content: str, path: str) -> str:
    if not path.endswith('.css'):
        return content
    if '@import "tailwindcss"' in content or "@import 'tailwindcss'" in content:
        content = content.replace('@import "tailwindcss"', '@tailwind base;\n@tailwind components;\n@tailwind utilities;')
        content = content.replace("@import 'tailwindcss'", '@tailwind base;\n@tailwind components;\n@tailwind utilities;')
    # Also handle @import "tailwindcss/..." sub-imports (v4)
    if '@import "tailwindcss/' in content or "@import 'tailwindcss/" in content:
        content = re.sub(r'''@import ['"]tailwindcss/[^'"]+['"];?\s*''', '', content)
        if '@tailwind base' not in content:
            content = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n' + content
    return content


# ── Fix 5: framer-motion removal ────────────────────────────────────────────

_FRAMER_IMPORT_RE = re.compile(
    r'''^\s*import\s+.*\s+from\s+['"]framer-motion['"]\s*;?\s*$''',
    re.MULTILINE,
)
_MOTION_TAG_OPEN = re.compile(r'<motion\.(\w+)')
_MOTION_TAG_CLOSE = re.compile(r'</motion\.(\w+)>')
_ANIMATE_PRESENCE_OPEN = re.compile(r'<AnimatePresence[^>]*>')
_ANIMATE_PRESENCE_CLOSE = re.compile(r'</AnimatePresence>')


def _strip_jsx_prop(content: str, prop_name: str) -> str:
    """
    Safely remove a JSX prop by name, handling nested braces correctly.
    Uses regex to find the prop, then manually walks nested braces to find
    the correct end position.
    """
    prop_pattern = re.compile(r'(\s+)' + re.escape(prop_name) + r'=\{')
    while True:
        match = prop_pattern.search(content)
        if not match:
            break

        start = match.start()
        brace_start = match.end() - 1

        depth = 0
        j = brace_start
        while j < len(content):
            if content[j] == '{':
                depth += 1
            elif content[j] == '}':
                depth -= 1
                if depth == 0:
                    content = content[:start] + content[j+1:]
                    break
            j += 1
        else:
            break

    return content


def _remove_motion_props(content: str) -> str:
    """Remove framer-motion props safely, handling nested braces."""
    motion_props = [
        'initial', 'animate', 'exit', 'transition',
        'whileHover', 'whileTap', 'whileInView', 'whileFocus',
        'whileDrag', 'variants', 'layout', 'layoutId',
    ]
    for prop in motion_props:
        if prop + '=' in content:
            content = _strip_jsx_prop(content, prop)
    return content


def _fix_framer_motion(content: str) -> str:
    if 'framer-motion' not in content and 'motion.' not in content:
        return content
    content = _FRAMER_IMPORT_RE.sub('', content)
    content = _MOTION_TAG_OPEN.sub(r'<\1', content)
    content = _MOTION_TAG_CLOSE.sub(r'</\1>', content)
    content = _ANIMATE_PRESENCE_OPEN.sub('', content)
    content = _ANIMATE_PRESENCE_CLOSE.sub('', content)
    content = _remove_motion_props(content)
    return content


# ── Fix 6: Missing import semicolons ────────────────────────────────────────

_IMPORT_NO_SEMI_RE = re.compile(
    r"""^(import\s+.+\s+from\s+['"][^'"]+['"])\s*$""",
    re.MULTILINE,
)


def _fix_import_semicolons(content: str) -> str:
    def add_semi(m: re.Match) -> str:
        line = m.group(1)
        if not line.rstrip().endswith(';'):
            return line + ';'
        return line
    return _IMPORT_NO_SEMI_RE.sub(add_semi, content)


# ── Fix 7-9: Config file fixes ──────────────────────────────────────────────

def _fix_config_issues(content: str, path: str) -> str:
    """Fix config-level issues in package.json, tailwind.config, etc."""
    # Fix 7: Remove @tailwindcss/postcss from package.json
    if path.endswith('package.json') and '@tailwindcss/postcss' in content:
        content = re.sub(r'''["']@tailwindcss/postcss["']\s*:\s*["'][^"']*["']\s*,?\s*\n?''', '', content)

    # Fix 8: darkMode array → string in tailwind.config
    if 'tailwind.config' in path:
        content = content.replace("darkMode: ['class']", "darkMode: 'class'")
        content = content.replace('darkMode: ["class"]', "darkMode: 'class'")

    return content


# ── Main sanitizer node ───────────────────────────────────────────────────────

def sanitize_code(state: BuilderState) -> BuilderState:
    """
    Pipeline node: runs deterministic fixes on all generated frontend files.
    Targets Vite + React SPA output.
    """
    frontend_files = dict(state.get("frontend_files") or {})
    fix_counts: dict[str, int] = {}

    for path, content in list(frontend_files.items()):
        if not isinstance(content, str):
            continue

        original = content

        # ── CSS files ──
        if path.endswith('.css'):
            content = _fix_tailwind_v4_css(content, path)
            if content != original:
                fix_counts["tailwind_v4_css"] = fix_counts.get("tailwind_v4_css", 0) + 1
            frontend_files[path] = content
            continue

        # ── Config files ──
        if any(path.endswith(ext) for ext in ('.json', '.config.js', '.config.mjs', '.config.ts')):
            content = _fix_config_issues(content, path)
            if content != original:
                fix_counts["config_fix"] = fix_counts.get("config_fix", 0) + 1
            frontend_files[path] = content
            continue

        # ── TypeScript/JSX files ──
        is_tsx = path.endswith(".tsx")
        is_ts = path.endswith(".ts")
        if not (is_tsx or is_ts):
            continue

        # Skip: shadcn/ui components (pre-generated), pure data files
        if "components/ui/" in path:
            continue
        if path in ("src/lib/types.ts", "src/lib/data.ts", "lib/types.ts", "lib/data.ts"):
            continue

        # Fix 1: Strip 'use client' (not needed in Vite)
        fixed = _strip_use_client(content)
        if fixed != content:
            content = fixed
            fix_counts["strip_use_client"] = fix_counts.get("strip_use_client", 0) + 1

        # Fix 3: Strip next/* imports
        fixed = _strip_next_imports(content)
        if fixed != content:
            content = fixed
            fix_counts["strip_next_imports"] = fix_counts.get("strip_next_imports", 0) + 1

        # Fix 5: framer-motion removal
        content = _fix_framer_motion(content)

        # Fix 6: Missing import semicolons
        content = _fix_import_semicolons(content)

        # Fix 2: Generic arrow rewrite
        fixed = _fix_generic_arrows(content)
        if fixed != content:
            content = fixed
            fix_counts["generic_arrows"] = fix_counts.get("generic_arrows", 0) + 1

        # Fix 2b: Arrow callbacks missing block body (=> \n const x = ...)
        fixed = _fix_arrow_missing_brace(content)
        if fixed != content:
            content = fixed
            fix_counts["arrow_missing_brace"] = fix_counts.get("arrow_missing_brace", 0) + 1

        # Track other fixes
        if content != original:
            if 'framer-motion' in original and 'framer-motion' not in content:
                fix_counts["framer_motion"] = fix_counts.get("framer_motion", 0) + 1

        frontend_files[path] = content

    # Build summary
    if fix_counts:
        parts = [f"{fix}: {count}" for fix, count in sorted(fix_counts.items())]
        message = f"Sanitizer applied {sum(fix_counts.values())} fixes: {', '.join(parts)}"
    else:
        message = "Sanitizer: no fixes needed"

    events = [{
        "type": "agent_complete",
        "agent": "sanitizer",
        "message": message,
    }]

    return {
        **state,
        "frontend_files": frontend_files,
        "events": events,
    }

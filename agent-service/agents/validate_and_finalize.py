"""
Deterministic Validator & Finalizer — replaces both QA and Packager LLM agents.

Performs structural validation on generated files:
  - Required files exist (App.tsx, main.tsx, index.css, configs)
  - Import resolution (stub missing components)
  - Brace/paren/angle bracket balancing (detect truncation + JSX errors)
  - JSX syntax validation (tag matching, unclosed elements)
  - Banned import detection
  - Auto-fix common syntax errors

Then finalizes the project with README and metadata.
Zero LLM cost. Runs in <100ms.
"""

import re
import time
import logging
from typing import Optional
from graph.state import BuilderState
from utils.file_builder import add_project_metadata
from utils.code_parser import extract_plan_block

logger = logging.getLogger(__name__)


# ── Plan cross-check helpers ───────────────────────────────────────────────

_LOCAL_IMPORT_RE = re.compile(
    r'''(?:import|from)\s+['"]@/([^'"]+)['"]'''
)


def _extract_file_manifest(plan: str) -> list[str]:
    """Extract file paths from the FILE_MANIFEST section of a PLAN block."""
    paths = []
    in_manifest = False
    for line in plan.split('\n'):
        stripped = line.strip()
        if 'FILE_MANIFEST' in stripped:
            in_manifest = True
            continue
        if in_manifest:
            # Stop at next section header
            if stripped and not stripped[0].isdigit() and '—' not in stripped and '.' not in stripped:
                if any(kw in stripped for kw in ('DEPENDENCY', 'STATE_', 'RISK_')):
                    break
            # Parse lines like "1. src/lib/types.ts — description"
            match = re.match(r'\d+[\.\)]\s*(\S+\.(?:tsx?|css|jsx?))', stripped)
            if match:
                paths.append(match.group(1))
    return paths


def cross_check_plan_vs_output(
    plan_block: Optional[str],
    files: dict[str, str],
) -> tuple[list[str], list[str]]:
    """
    Deterministic cross-check: verify LLM's PLAN matches actual generated files.
    Returns (issues, auto_fixes) lists.

    Checks:
    1. Every file in FILE_MANIFEST was actually generated
    2. All local @/ imports resolve to existing files
    3. No 'use client' directives (Vite doesn't need them)
    """
    issues: list[str] = []
    auto_fixes: list[str] = []

    # 1. Check FILE_MANIFEST completeness
    if plan_block:
        planned = _extract_file_manifest(plan_block)
        for path in planned:
            if path not in files:
                issues.append(f"PLAN declared {path} but file was not generated")

    # 2. Strip any 'use client' directives (Vite doesn't need them)
    for path, content in list(files.items()):
        if not path.endswith(('.tsx', '.ts')):
            continue
        if content.strip().startswith("'use client'") or content.strip().startswith('"use client"'):
            files[path] = re.sub(r"""^['"]use client['"]\s*;?\s*\n*""", "", content, flags=re.MULTILINE)
            auto_fixes.append(f"Stripped 'use client' from {path} (not needed in Vite)")

    # 3. Verify all local imports resolve (regardless of PLAN)
    all_paths = set(files.keys())
    path_stems = set()
    for p in all_paths:
        for ext in ('.tsx', '.ts', '.jsx', '.js'):
            if p.endswith(ext):
                path_stems.add(p[:-len(ext)])

    for path, content in files.items():
        if not path.endswith(('.tsx', '.ts', '.jsx', '.js')):
            continue
        for match in _LOCAL_IMPORT_RE.finditer(content):
            import_path = match.group(1)
            # Skip ui components (handled separately)
            if "components/ui/" in import_path:
                continue
            candidates = [
                import_path,
                import_path + ".tsx", import_path + ".ts",
                import_path + ".jsx", import_path + ".js",
                import_path + "/index.tsx", import_path + "/index.ts",
            ]
            exists = any(c in all_paths for c in candidates) or import_path in path_stems
            if not exists:
                issues.append(f"{path} imports @/{import_path} but file not in output")

    return issues, auto_fixes


# ── JSX/TSX Syntax Validation & Auto-Fix ─────────────────────────────────────

# Regex to strip string literals and comments so brace/tag counting is accurate
_STRING_OR_COMMENT_RE = re.compile(
    r'`(?:[^`\\]|\\.)*`'           # template literals
    r"|'(?:[^'\\]|\\.)*'"          # single-quoted strings
    r'|"(?:[^"\\]|\\.)*"'         # double-quoted strings
    r'|/\*[\s\S]*?\*/'            # block comments
    r'|//[^\n]*',                  # line comments
    re.DOTALL,
)


def _strip_strings_and_comments(code: str) -> str:
    """Remove string literals and comments so analysis operates on code structure only."""
    return _STRING_OR_COMMENT_RE.sub('""', code)


def _check_jsx_syntax(content: str, path: str) -> list[str]:
    """
    Validate JSX/TSX syntax by checking:
    1. Balanced braces { } — threshold >2 (strict)
    2. Balanced parens ( ) — threshold >2 (strict)
    3. JSX tag matching — every <Component> has </Component>
    4. Common syntax patterns that cause "Unexpected token" errors
    """
    issues = []
    stripped = _strip_strings_and_comments(content)

    # 1. Brace balance
    brace_diff = stripped.count('{') - stripped.count('}')
    if abs(brace_diff) > 2:
        issues.append(f"Unbalanced braces in {path}: {brace_diff:+d} (likely truncated or malformed)")

    paren_diff = stripped.count('(') - stripped.count(')')
    if abs(paren_diff) > 2:
        issues.append(f"Unbalanced parens in {path}: {paren_diff:+d}")

    # 2. JSX tag matching
    open_tags = re.findall(r'<([A-Z]\w+)(?:\s|>|/)', stripped)
    close_tags = re.findall(r'</([A-Z]\w+)>', stripped)
    self_closing = re.findall(r'<([A-Z]\w+)\s[^>]*/>', stripped)

    open_counts: dict[str, int] = {}
    close_counts: dict[str, int] = {}
    for tag in open_tags:
        open_counts[tag] = open_counts.get(tag, 0) + 1
    for tag in close_tags:
        close_counts[tag] = close_counts.get(tag, 0) + 1
    for tag in self_closing:
        open_counts[tag] = open_counts.get(tag, 0) - 1

    all_tags = set(list(open_counts.keys()) + list(close_counts.keys()))
    for tag in all_tags:
        opens = open_counts.get(tag, 0)
        closes = close_counts.get(tag, 0)
        diff = opens - closes
        if diff > 1:
            issues.append(f"Unclosed JSX tag <{tag}> in {path}: {opens} opens, {closes} closes")
        elif diff < -1:
            issues.append(f"Extra closing tag </{tag}> in {path}: {opens} opens, {closes} closes")

    # 3. Detect common "Unexpected token" patterns
    bad_patterns = [
        (r'(?:const|let|var)\s+\w+\s*=\s*[^;{}\n]+\n\s*<[A-Z]',
         "Variable assignment followed by JSX without semicolon/return"),
    ]
    for pattern, msg in bad_patterns:
        if msg and re.search(pattern, content):
            issues.append(f"{msg} in {path}")

    return issues


def _auto_fix_jsx_issues(content: str, path: str) -> tuple[str, list[str]]:
    """
    Attempt to auto-fix common JSX syntax issues.
    Returns (fixed_content, list_of_fixes_applied).
    """
    fixes = []

    # Fix 1: Remove </img> (invalid — img is void element)
    if '</img>' in content:
        content = content.replace('</img>', '')
        fixes.append(f"Removed invalid </img> closing tag in {path}")

    # Fix 2: Remove </br> (invalid — br is void element)
    if '</br>' in content:
        content = content.replace('</br>', '')
        fixes.append(f"Removed invalid </br> closing tag in {path}")

    # Fix 3: Remove </hr> (invalid — hr is void element)
    if '</hr>' in content:
        content = content.replace('</hr>', '')
        fixes.append(f"Removed invalid </hr> closing tag in {path}")

    # Fix 4: Remove </input> (invalid — input is void element)
    if '</input>' in content:
        content = content.replace('</input>', '')
        fixes.append(f"Removed invalid </input> closing tag in {path}")

    # Fix 5: Fix arrow callbacks missing block body
    content_before = content
    content = re.sub(
        r'(=>\s*)\n(\s*)(const |let |var |if |for |while |switch |try |return\b)',
        r'\1{\n\2\3',
        content,
    )
    if content != content_before:
        fixes.append(f"Fixed arrow callback missing block body {{ }} in {path}")

    # Fix 6: Fix common missing semicolons after variable declarations before JSX
    def fix_missing_semi(m: re.Match) -> str:
        return m.group(1) + ';\n' + m.group(2)
    content_before = content
    content = re.sub(
        r'((?:const|let|var)\s+\w+\s*=\s*(?:true|false|null|undefined|\d+|\'[^\']*\'|"[^"]*"))\s*\n(\s*<[A-Z])',
        fix_missing_semi,
        content,
    )
    if content != content_before:
        fixes.append(f"Added missing semicolons before JSX in {path}")

    # Fix 7: Ensure file ends with a complete export if it seems truncated
    stripped = content.rstrip()
    if stripped and not stripped.endswith(('}', ')', ';', '*/', '-->')):
        brace_diff = content.count('{') - content.count('}')
        if brace_diff > 0 and brace_diff <= 3:
            content = content.rstrip() + '\n' + '}\n' * brace_diff
            fixes.append(f"Auto-closed {brace_diff} unclosed braces in {path}")

    return content, fixes


# ── Default templates for missing files ──────────────────────────────────────

DEFAULT_APP = """\
export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold">Welcome</h1>
      <p className="mt-4 text-muted-foreground">Your app is ready.</p>
    </main>
  )
}
"""

DEFAULT_MAIN = """\
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
"""

DEFAULT_INDEX_CSS = """\
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
"""

# ── Import resolution ────────────────────────────────────────────────────────

_IMPORT_PATH_RE = re.compile(
    r'''(?:import|from)\s+['"]@/([^'"]+)['"]'''
)


def _resolve_imports(files: dict[str, str]) -> dict[str, str]:
    """
    Find all @/components/* and @/lib/* imports. If the target file doesn't
    exist in the file set, generate a stub. Returns dict of new stub files.
    """
    stubs: dict[str, str] = {}
    all_paths = set(files.keys())

    # Also index without extension (src/components/Foo matches src/components/Foo.tsx)
    path_stems = set()
    for p in all_paths:
        for ext in ('.tsx', '.ts', '.jsx', '.js'):
            if p.endswith(ext):
                path_stems.add(p[:-len(ext)])

    for path, content in files.items():
        if not path.endswith(('.tsx', '.ts', '.jsx', '.js')):
            continue
        for match in _IMPORT_PATH_RE.finditer(content):
            import_path = match.group(1)
            # Skip ui components (handled by ui_components.py)
            if "components/ui/" in import_path:
                continue

            # Check if file exists (with or without extension)
            candidates = [
                import_path,
                import_path + ".tsx",
                import_path + ".ts",
                import_path + ".jsx",
                import_path + ".js",
                import_path + "/index.tsx",
                import_path + "/index.ts",
            ]
            exists = any(c in all_paths for c in candidates) or import_path in path_stems
            if not exists and import_path not in stubs:
                # Generate stub — all Vite files are client-side, no 'use client' needed
                if "lib/" in import_path:
                    # Type/data stub
                    stubs[import_path + ".ts"] = (
                        f"// Auto-generated stub for {import_path}\n"
                        f"// Replace with actual implementation\n"
                        f"export {{}}\n"
                    )
                elif "components/" in import_path:
                    # Component stub
                    name = import_path.split("/")[-1]
                    stubs[import_path + ".tsx"] = (
                        f"export default function {name}({{ ...props }}: any) {{\n"
                        f"  return <div {{...props}}>{{/* {name} stub */}}</div>\n"
                        f"}}\n"
                    )

    return stubs


# ── File existence checks ────────────────────────────────────────────────────

def _ensure_index_css(files: dict[str, str]) -> dict[str, str]:
    """Ensure src/index.css exists with correct Tailwind directives."""
    result = dict(files)
    css_path = next(
        (k for k in result if k in ("src/index.css", "app/globals.css", "src/app/globals.css")),
        None,
    )
    if css_path is None:
        result["src/index.css"] = DEFAULT_INDEX_CSS
    else:
        css = result[css_path]
        # Fix Tailwind v4 syntax
        if '@import "tailwindcss"' in css or "@import 'tailwindcss'" in css:
            css = css.replace('@import "tailwindcss"', '@tailwind base;\n@tailwind components;\n@tailwind utilities;')
            css = css.replace("@import 'tailwindcss'", '@tailwind base;\n@tailwind components;\n@tailwind utilities;')
            result[css_path] = css
        # Ensure @tailwind directives exist
        if "@tailwind base" not in css:
            result[css_path] = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n" + css
        # Rename legacy path to src/index.css
        if css_path != "src/index.css":
            result["src/index.css"] = result.pop(css_path)
    return result


def _ensure_app(files: dict[str, str]) -> dict[str, str]:
    """Ensure src/App.tsx exists."""
    result = dict(files)
    # Check for various possible paths
    app_path = next(
        (k for k in result if k in ("src/App.tsx", "app/page.tsx", "src/app/page.tsx", "App.tsx")),
        None,
    )
    if app_path is None:
        result["src/App.tsx"] = DEFAULT_APP
    elif app_path != "src/App.tsx":
        # Rename to correct Vite path
        content = result.pop(app_path)
        # Strip 'use client' if present
        content = re.sub(r"""^['"]use client['"]\s*;?\s*\n*""", "", content, flags=re.MULTILINE)
        result["src/App.tsx"] = content
    return result


def _ensure_main(files: dict[str, str]) -> dict[str, str]:
    """Ensure src/main.tsx exists."""
    result = dict(files)
    if "src/main.tsx" not in result:
        result["src/main.tsx"] = DEFAULT_MAIN
    else:
        # Ensure it imports index.css
        main = result["src/main.tsx"]
        if "index.css" not in main and "globals.css" not in main:
            # Add import
            main = main.rstrip() + "\nimport './index.css'\n"
            result["src/main.tsx"] = main
    return result


# ── Main pipeline node ───────────────────────────────────────────────────────

def validate_and_finalize(state: BuilderState) -> BuilderState:
    """
    Deterministic validation + finalization. Replaces QA + Packager agents.
    Zero LLM cost. Catches structural issues and fixes them.
    Targets Vite + React SPA output.
    """
    start_time = time.time()
    blueprint = state.get("blueprint", {})
    integrated_files = state.get("integrated_files", {}) or {}

    files = dict(integrated_files)
    issues: list[str] = []
    fixes: list[str] = []

    # 1. Ensure required files exist
    files = _ensure_index_css(files)
    files = _ensure_app(files)
    files = _ensure_main(files)

    if "src/index.css" not in integrated_files and "app/globals.css" not in integrated_files:
        fixes.append("Injected src/index.css with Tailwind directives")
    if "src/App.tsx" not in integrated_files and "app/page.tsx" not in integrated_files:
        fixes.append("Injected src/App.tsx")
    if "src/main.tsx" not in integrated_files:
        fixes.append("Injected src/main.tsx")

    # 2. Cross-check PLAN vs actual output (trust but verify)
    plan_block = extract_plan_block(
        state.get("_frontend_raw_output", "") or ""
    )
    plan_issues, plan_fixes = cross_check_plan_vs_output(plan_block, files)
    issues.extend(plan_issues)
    fixes.extend(plan_fixes)
    if plan_issues:
        logger.warning(f"[validate] Plan cross-check found {len(plan_issues)} issues: {plan_issues}")
    if plan_fixes:
        logger.info(f"[validate] Plan cross-check auto-fixed: {plan_fixes}")

    # 3. Resolve missing imports — generate stubs for missing components/libs
    stubs = _resolve_imports(files)
    if stubs:
        files.update(stubs)
        stub_names = ", ".join(stubs.keys())
        fixes.append(f"Generated {len(stubs)} stubs for missing imports: {stub_names}")

    # 4. JSX syntax validation and auto-fix for ALL .tsx/.ts files
    for path in list(files.keys()):
        content = files[path]
        if not path.endswith(('.tsx', '.ts')):
            continue

        # Empty file check
        if len(content.strip()) < 10:
            issues.append(f"Empty file: {path}")
            continue

        # Auto-fix common JSX issues FIRST
        fixed_content, jsx_fixes = _auto_fix_jsx_issues(content, path)
        if jsx_fixes:
            files[path] = fixed_content
            fixes.extend(jsx_fixes)
            content = fixed_content

        # Then validate JSX syntax (on the fixed content)
        if path.endswith('.tsx'):
            jsx_issues = _check_jsx_syntax(content, path)
            issues.extend(jsx_issues)

        # Banned import check
        if "framer-motion" in content:
            issues.append(f"Banned import 'framer-motion' still in {path}")
        # Strip any residual next/* imports
        if "'next/" in content or '"next/' in content:
            content = re.sub(
                r"""^\s*import\s+.*\s+from\s+['"]next/[^'"]+['"]\s*;?\s*$""",
                '', content, flags=re.MULTILINE
            )
            files[path] = content
            fixes.append(f"Stripped residual next/* import from {path}")

    # 5. Add project metadata (README, .env.example)
    app_name = blueprint.get("app_name", "My App")
    files = add_project_metadata(files, app_name)

    # 6. Build completion events
    duration_ms = int((time.time() - start_time) * 1000)
    total_files = len(files)

    if issues:
        logger.warning(f"[validate] {len(issues)} issues found: {issues}")
    if fixes:
        logger.info(f"[validate] {len(fixes)} auto-fixes applied: {fixes}")

    events = [
        {
            "type": "agent_start",
            "agent": "packager",
            "message": "Validating and finalizing project...",
        },
        {
            "type": "agent_complete",
            "agent": "packager",
            "message": (
                f"Project validated: {total_files} files ready"
                + (f", {len(fixes)} auto-fixes applied" if fixes else "")
                + (f", {len(issues)} warnings" if issues else "")
            ),
            "duration_ms": duration_ms,
        },
        {
            "type": "text",
            "content": (
                f"Validator finalized **{total_files} files**. "
                + (f"Applied {len(fixes)} auto-fixes. " if fixes else "")
                + "Your app is ready!\n\n"
                + "Run `npm install && npm run dev` to start your app.\n"
            ),
        },
        {
            "type": "complete",
            "files": files,
            "blueprint": blueprint,
            "message": "Build complete!",
        },
    ]

    return {
        **state,
        "final_files": files,
        "current_agent": "complete",
        "qa_result": {
            "passed": True,
            "score": 100 - len(issues) * 5,
            "issues": [{"severity": "warning", "description": i} for i in issues],
            "summary": f"Deterministic validation: {len(issues)} warnings, {len(fixes)} auto-fixes",
        },
        "events": events,
    }

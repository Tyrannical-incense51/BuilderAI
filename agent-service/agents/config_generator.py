"""
Deterministic Config Generator — replaces the integrator LLM agent.

Scans generated frontend/backend files for imports, then emits:
  - package.json   (with correct dependency versions)
  - tailwind.config.js
  - postcss.config.js
  - vite.config.ts
  - tsconfig.json
  - index.html      (Vite entry point)
  - src/main.tsx     (React bootstrap)

Zero LLM cost. 100% reliable. Runs in <50ms.

NOTE: Generated projects use Vite + React (NOT Next.js). Vite uses esbuild
which is fast and reliable inside WebContainers. Next.js SWC caused persistent
"Unexpected token" parse errors in WASM environments.
"""

import json
import re
import time
from graph.state import BuilderState


# ── Known dependency registry ────────────────────────────────────────────────
# Maps npm package name → correct semver for Vite + React 18 projects.
# Only packages the LLM is likely to import. If a package isn't here,
# we still include it with "latest" (npm will resolve).

CORE_DEPS = {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
}

CORE_DEV_DEPS = {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.0.0",
}

KNOWN_DEPS: dict[str, str] = {
    # UI / styling
    "lucide-react": "^0.400.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0",

    # Radix UI primitives (shadcn)
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-checkbox": "^1.0.4",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-progress": "^1.0.3",
    "@radix-ui/react-separator": "^1.0.3",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-popover": "^1.0.7",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@radix-ui/react-accordion": "^1.1.2",
    "@radix-ui/react-alert-dialog": "^1.0.5",
    "@radix-ui/react-aspect-ratio": "^1.0.3",
    "@radix-ui/react-collapsible": "^1.0.3",
    "@radix-ui/react-context-menu": "^2.1.5",
    "@radix-ui/react-hover-card": "^1.0.7",
    "@radix-ui/react-menubar": "^1.0.4",
    "@radix-ui/react-navigation-menu": "^1.1.4",
    "@radix-ui/react-radio-group": "^1.1.3",
    "@radix-ui/react-scroll-area": "^1.0.5",
    "@radix-ui/react-slider": "^1.1.2",
    "@radix-ui/react-toast": "^1.1.5",
    "@radix-ui/react-toggle": "^1.0.3",
    "@radix-ui/react-toggle-group": "^1.0.4",

    # Charts & data viz
    "recharts": "^2.12.0",

    # State management
    "zustand": "^4.5.0",

    # Utilities
    "date-fns": "^3.6.0",
    "uuid": "^9.0.0",

    # Drag and drop
    "@hello-pangea/dnd": "^16.5.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",

    # Supabase
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",

    # Form handling
    "react-hook-form": "^7.52.0",
    "@hookform/resolvers": "^3.6.0",
    "zod": "^3.23.0",

    # Misc
    "cmdk": "^1.0.0",
    "sonner": "^1.5.0",
    "react-router-dom": "^6.23.0",
    "react-day-picker": "^8.10.0",
    "embla-carousel-react": "^8.1.0",
    "input-otp": "^1.2.0",
    "vaul": "^0.9.0",
    "react-resizable-panels": "^2.0.0",
}

BANNED_DEPS = frozenset({
    "framer-motion", "gsap", "react-spring", "react-transition-group",
    "@tailwindcss/postcss",   # v4-only package
    "@tailwindcss/vite",      # v4-only package
})

# Built-in modules that should NOT appear in package.json
BUILTIN_MODULES = frozenset({
    "react", "react-dom",
    "fs", "path", "os", "crypto", "stream", "http",
    "https", "url", "util", "events", "buffer", "querystring",
    "child_process", "assert", "zlib",
})


# ── Import scanner ───────────────────────────────────────────────────────────

_IMPORT_RE = re.compile(
    r'''(?:import\s+(?:[\w{}\s,*]+\s+from\s+)?|from\s+)['"]([^./'"@][^'"]*|@[^'"]+)['"]''',
)


def scan_imports(files: dict[str, str]) -> set[str]:
    """Scan all source files for npm package imports. Returns package names."""
    pkgs: set[str] = set()
    for path, content in files.items():
        if not path.endswith(('.tsx', '.ts', '.jsx', '.js', '.mjs')):
            continue
        for match in _IMPORT_RE.finditer(content):
            raw = match.group(1)
            # Skip project-local aliases: @/ is Next.js path alias, not npm
            if raw.startswith("@/"):
                continue
            # Normalize: @scope/pkg/subpath → @scope/pkg
            if raw.startswith("@"):
                parts = raw.split("/")
                pkg = "/".join(parts[:2]) if len(parts) >= 2 else raw
            else:
                pkg = raw.split("/")[0]
            # Skip built-in and banned
            if pkg not in BUILTIN_MODULES and pkg not in BANNED_DEPS:
                pkgs.add(pkg)
    return pkgs


# ── Config templates ─────────────────────────────────────────────────────────

def _build_package_json(
    app_name: str,
    detected_deps: set[str],
    blueprint: dict,
) -> str:
    deps = dict(CORE_DEPS)
    for pkg in sorted(detected_deps):
        if pkg in KNOWN_DEPS:
            deps[pkg] = KNOWN_DEPS[pkg]
        elif pkg not in CORE_DEPS and pkg not in CORE_DEV_DEPS:
            deps[pkg] = "latest"

    pkg = {
        "name": app_name.lower().replace(" ", "-"),
        "version": "0.1.0",
        "private": True,
        "scripts": {
            "dev": "vite",
            "build": "vite build",
            "preview": "vite preview",
        },
        "dependencies": dict(sorted(deps.items())),
        "devDependencies": dict(sorted(CORE_DEV_DEPS.items())),
    }
    return json.dumps(pkg, indent=2) + "\n"


TAILWIND_CONFIG = """\
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
    },
  },
  plugins: [],
}
"""

POSTCSS_CONFIG = """\
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
"""

VITE_CONFIG = """\
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
"""

INDEX_HTML = """\
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{app_name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
"""

MAIN_TSX = """\
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

TSCONFIG = """\
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "ES2020"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "paths": {"@/*": ["./src/*"]}
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite-env.d.ts"],
  "exclude": ["node_modules"]
}
"""


# ── Pipeline node ────────────────────────────────────────────────────────────

def generate_configs(state: BuilderState) -> BuilderState:
    """
    Deterministic config generator — replaces the integrator LLM agent.
    Scans frontend + backend files for imports, then emits all config files
    with correct dependency versions. Zero LLM cost.
    """
    start_time = time.time()

    blueprint = state.get("blueprint", {})
    frontend_files = state.get("frontend_files", {}) or {}
    backend_files = state.get("backend_files", {}) or {}
    previous_files = state.get("previous_files") or {}

    # Merge all code files for scanning
    all_code_files = {**previous_files, **frontend_files, **backend_files}

    # Scan imports
    detected_deps = scan_imports(all_code_files)

    # Build config files
    app_name = blueprint.get("app_name", "builderai-project")
    configs: dict[str, str] = {}

    configs["package.json"] = _build_package_json(app_name, detected_deps, blueprint)
    configs["tailwind.config.js"] = TAILWIND_CONFIG
    configs["postcss.config.js"] = POSTCSS_CONFIG
    configs["tsconfig.json"] = TSCONFIG

    # Vite entry point and config
    has_vite_config = any(
        k in all_code_files for k in ("vite.config.ts", "vite.config.js")
    )
    if not has_vite_config:
        configs["vite.config.ts"] = VITE_CONFIG

    # index.html — Vite's entry point (always overwrite to ensure correct <script> tag)
    configs["index.html"] = INDEX_HTML.format(app_name=app_name)

    # src/main.tsx — React bootstrap (only if not already generated)
    if "src/main.tsx" not in all_code_files:
        configs["src/main.tsx"] = MAIN_TSX

    # Remove any leftover Next.js configs from LLM output
    for nx_key in ("next.config.js", "next.config.ts", "next.config.mjs"):
        all_code_files.pop(nx_key, None)

    # Merge: all generated code files + config files (configs overwrite LLM-generated ones)
    integrated_files = {**all_code_files, **configs}

    duration_ms = int((time.time() - start_time) * 1000)

    events = [
        {
            "type": "agent_start",
            "agent": "integrator",
            "message": "Generating project configs...",
        },
        {
            "type": "agent_complete",
            "agent": "integrator",
            "message": f"Generated {len(configs)} config files, detected {len(detected_deps)} dependencies",
            "duration_ms": duration_ms,
        },
        {
            "type": "text",
            "content": (
                f"Config Generator assembled **{len(integrated_files)} total files** "
                f"with **{len(detected_deps)} dependencies** detected from imports.\n"
            ),
        },
        {
            "type": "files_update",
            "files": integrated_files,
        },
    ]

    return {
        **state,
        "integrated_files": integrated_files,
        "events": events,
    }

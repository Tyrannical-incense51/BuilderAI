"""
BuilderAI Agent Service — Configuration

Set LLM_MODE env var to switch providers:
  LLM_MODE=cli   → Uses Claude Code CLI (your subscription, zero API cost)
  LLM_MODE=api   → Uses Anthropic API (requires ANTHROPIC_API_KEY)
"""

import os

# Provider mode: "cli" (default for dev) or "api" (for production)
LLM_MODE = os.getenv("LLM_MODE", "cli")

# Per-agent model selection (only used in API mode; CLI uses your Claude Code config)
# Heavy generation agents → Opus 4.6; lightweight utility agents → Sonnet 4.6
AGENT_MODELS = {
    "architect":  os.getenv("ARCHITECT_MODEL",  "claude-opus-4-6"),
    "frontend":   os.getenv("FRONTEND_MODEL",   "claude-opus-4-6"),
    "backend":    os.getenv("BACKEND_MODEL",    "claude-opus-4-6"),
    "integrator": os.getenv("INTEGRATOR_MODEL", "claude-opus-4-6"),
    "qa":         os.getenv("QA_MODEL",         "claude-sonnet-4-6"),
    "packager":   os.getenv("PACKAGER_MODEL",   "claude-sonnet-4-6"),
    "repair":     os.getenv("REPAIR_MODEL",     "claude-sonnet-4-6"),
    "fix":        os.getenv("FIX_MODEL",        "claude-sonnet-4-6"),
    "iterate":    os.getenv("ITERATE_MODEL",    "claude-sonnet-4-6"),
}

# Extended thinking budget (API mode only, ignored in CLI mode).
# Lets the LLM reason internally before generating output — dramatically
# improves code quality by planning component structure, dependency graphs,
# and 'use client' placement before writing any code.
# Set to 0 or None to disable extended thinking for an agent.
AGENT_THINKING_BUDGET = {
    "architect":  5000,    # Plan app structure (must be < max_tokens=8000)
    "frontend":   16000,   # Reason about imports, state, 'use client', dependencies
    "backend":    8000,    # Plan API routes, DB schema, error handling
    "repair":     0,       # Simple completion — no thinking needed
    "fix":        4000,    # Analyze error, plan fix
    "iterate":    8000,    # Understand change scope, plan edits
}

# Per-agent timeout in seconds.
# CLI mode generates all code in one subprocess call — complex apps (game loops,
# large component trees, 16k-token outputs) can take 5-8 minutes via CLI.
# These timeouts must be longer than the longest expected generation time.
AGENT_TIMEOUTS = {
    "architect":  300,   # 5 min  — blueprint is shorter, but give headroom
    "frontend":   600,   # 10 min — largest output (16k tokens of React/TS)
    "backend":    480,   # 8 min  — API routes + DB schema
    "repair":     120,   # 2 min  — small targeted completion calls per truncated file
    "integrator": 120,   # 2 min  — configs only (package.json + tailwind + postcss)
    "qa":         300,   # 5 min
    "packager":   300,   # 5 min
    "fix":         90,   # 1.5 min — single file surgical fix
    "iterate":    180,   # 3 min  — targeted multi-file change
}

# Per-agent max tokens
# Claude Sonnet 4.6 / Opus 4.6 support up to 64K output tokens.
# Frontend and integrator need the most headroom — they generate full codebases.
AGENT_MAX_TOKENS = {
    "architect":  8000,   # Increased: complex apps need bigger blueprints with seed data
    "frontend":   60000,  # Increased: multi-page e-commerce needs more room
    "backend":    32000,
    "repair":     4000,   # Enough to reconstruct complex components (ProductCard, CartPage)
    "integrator": 8000,   # Configs only: package.json + tailwind + postcss
    "qa":         4096,
    "packager":   16000,
    "fix":        16000,  # Full component file replacement
    "iterate":   32000,  # Multiple files may change
}

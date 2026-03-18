# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (Next.js)
```bash
npm run dev       # Dev server on port 3000
npm run build     # TypeScript compile + production build
npm run lint      # ESLint check
npm run start     # Production server
```

### Backend (Python FastAPI)
```bash
cd agent-service
pip install -r requirements.txt
python main.py    # Uvicorn on port 8000 with auto-reload
```

## Architecture

**BuilderAI** is a multi-agent AI app builder. Users describe an app in natural language; a 6-agent LangGraph pipeline generates a complete Next.js project in real time.

### Stack
- **Frontend**: Next.js 14 App Router, React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui
- **State**: Zustand 5 (client), Supabase (server/DB)
- **Backend**: Python 3.11+, FastAPI, LangGraph, Anthropic SDK
- **Auth/DB**: Supabase (PostgreSQL with RLS)
- **AI**: Claude claude-opus-4-6 (user preference) via CLI subprocess or Anthropic API

### LangGraph Pipeline (`agent-service/graph/pipeline.py`)

```
architect → [frontend ‖ backend] (parallel) → integrator → qa → packager
                                                          ↑         |
                                                          └── retry (max 2)
```

Each agent lives in `agent-service/agents/` with a paired prompt in `agent-service/prompts/`. The QA agent conditionally loops back to the failed agent on failure (max 2 retries), then packager runs regardless.

### Dual LLM Mode (`agent-service/utils/llm_provider.py`)

- **`cli` mode** (default): Spawns `claude -p` subprocess via `asyncio.create_subprocess_exec` — uses Claude Code subscription, zero API cost
- **`api` mode**: Anthropic SDK with streaming + exponential backoff on 529 errors

Toggle via `LLM_MODE` env var or per-request via `llm_mode` field in `GenerateRequest`.

### SSE Streaming Flow

```
Browser ChatPanel
  → POST /api/chat (Next.js route)
    → Supabase auth check + load previous files from DB
    → POST http://localhost:8000/generate (FastAPI, streaming)
      → LangGraph emits SSE events: agent_start | agent_complete | error | agent_retry | complete
    → Next.js forwards events, persists agent_logs + final_files to Supabase
  → Zustand stores (useChatStore, useProjectStore) update UI in real time
```

The `events` field in `BuilderState` uses `Annotated[list, operator.add]` so LangGraph accumulates events across all nodes without overwriting.

### Key Files

| Path | Purpose |
|------|---------|
| `agent-service/graph/state.py` | `BuilderState` TypedDict — source of truth for all pipeline data |
| `agent-service/graph/pipeline.py` | LangGraph node wiring and conditional edges |
| `agent-service/main.py` | FastAPI server, `/generate` SSE endpoint, `/health` |
| `agent-service/config.py` | Per-agent timeout/token limits, model selection |
| `app/api/chat/route.ts` | Main Next.js SSE proxy + Supabase persistence |
| `lib/store/useProjectStore.ts` | Agent status tracking, file state, active tab |
| `lib/store/useChatStore.ts` | Chat messages + streaming state |
| `components/BuilderInterface.tsx` | Top-level 3-panel layout (chat | preview | pipeline) |
| `next.config.ts` | Rewrites `/agent/*` → FastAPI; COEP/COOP headers for WebContainers |
| `supabase/migrations/001_initial_schema.sql` | Full DB schema (profiles, projects, messages, agent_logs) |

### Routing

- `/` — Landing page (public)
- `/(auth)/login`, `/(auth)/signup` — Auth pages
- `/(dashboard)/dashboard` — Project list
- `/(dashboard)/project/[id]` — Builder view (protected)
- `/(dashboard)/settings` — LLM mode toggle + API key

`middleware.ts` protects `/dashboard`, `/project/*`, `/projects` routes via Supabase SSR.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY          # Required only for LLM_MODE=api
AGENT_SERVICE_URL          # Default: http://localhost:8000
NEXT_PUBLIC_APP_URL        # Default: http://localhost:3000
```

Supabase is optional in development — `middleware.ts` skips auth gracefully if env vars are missing.

## Known Gotchas

- Use `@codesandbox/sandpack-react` — `@sandpack/react` does not exist on npm
- Tailwind `darkMode` must be `'class'` (string), not `['class']` (array)
- JSZip downloads: use `generateAsync({ type: 'arraybuffer' })` with plain `Response`, not `NextResponse`
- Supabase `setAll` cookie handler requires explicit types: `{ name: string; value: string; options?: Record<string, unknown> }[]`
- The `shadcn label` component must be added separately: `npx shadcn@latest add label`
- COEP/COOP headers in `next.config.ts` are required for WebContainer API to work

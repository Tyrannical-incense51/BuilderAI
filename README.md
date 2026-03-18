# BuilderAI

> AI-powered app builder using a multi-agent LangGraph pipeline

## Architecture

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Preview**: Sandpack (in-browser live preview), Monaco Editor
- **State**: Zustand
- **Streaming**: Server-Sent Events (SSE)
- **Database & Auth**: Supabase (PostgreSQL + Auth + RLS)
- **Agent Service**: Python FastAPI + LangGraph + Claude Opus 4.6

## Multi-Agent Pipeline

```
User Prompt
    │
    ▼
┌─────────────┐
│  Architect  │  → App blueprint (JSON)
└──────┬──────┘
       │
  ┌────┴────┐
  ▼         ▼
Frontend  Backend   (parallel)
  Agent    Agent
  └────┬────┘
       │
       ▼
┌─────────────┐
│  Integrator │  → Merged + fixed files
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   QA Agent  │──── FAIL ──→ back to Integrator (max 3x)
└──────┬──────┘
       │ PASS
       ▼
┌─────────────┐
│  Packager   │  → Final project + README + .env.example
└─────────────┘
```

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd builderai
npm install
```

### 2. Set up Supabase

1. Create a project at supabase.com
2. Run the migration: `supabase/migrations/001_initial_schema.sql`
3. Enable GitHub OAuth in Auth settings

### 3. Configure environment

```bash
cp .env.example .env.local
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
```

### 4. Start the agent service

```bash
cd agent-service
pip install -r requirements.txt
cp .env.example .env
# Fill in ANTHROPIC_API_KEY
python main.py
```

### 5. Start Next.js

```bash
npm run dev
```

## Deploy

- **Frontend**: Vercel (connect GitHub repo)
- **Agent Service**: Railway or Render (set ANTHROPIC_API_KEY)
- **Database**: Supabase (already hosted)

import { NextResponse } from 'next/server'

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8000'

export async function GET() {
  try {
    // Ask the agent service directly — it's the one that holds the API key
    const res = await fetch(`${AGENT_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json({
        hasApiKey: data.has_api_key ?? false,
        agentServiceHealthy: true,
        agentServiceUp: true, // kept for backwards compat
        llmMode: data.llm_mode ?? null,
        defaultModel: data.default_model ?? null,
      })
    }
  } catch {
    // Agent service unreachable
  }

  return NextResponse.json({
    hasApiKey: false,
    agentServiceHealthy: false,
    agentServiceUp: false,
    llmMode: null,
    defaultModel: null,
  })
}

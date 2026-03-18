import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const agentUrl = process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000'
    const res = await fetch(`${agentUrl}/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Agent service error')
      return NextResponse.json(
        { error: `Fix agent failed: ${errText}` },
        { status: res.status >= 500 ? 502 : res.status }
      )
    }

    const data = await res.json().catch(() => null)
    if (!data) {
      return NextResponse.json({ error: 'Invalid response from agent service' }, { status: 502 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/fix] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

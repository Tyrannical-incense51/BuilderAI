import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8000'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const body = await request.json()

  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Update project status to building
    await supabase
      .from('projects')
      .update({ status: 'building' })
      .eq('id', id)
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agentResponse = await fetch(`${AGENT_SERVICE_URL}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: id,
            prompt: body.prompt,
            conversation_history: body.conversation_history || [],
            llm_mode: body.llm_mode || 'cli',
            llm_model: body.llm_model || null,
          }),
        })

        if (!agentResponse.ok || !agentResponse.body) {
          throw new Error('Agent service unavailable')
        }

        const reader = agentResponse.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(encoder.encode(decoder.decode(value)))
        }
      } catch (err) {
        const errorMsg = `data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`
        controller.enqueue(encoder.encode(errorMsg))

        // Update project status to failed
        if (supabase) {
          await supabase
            .from('projects')
            .update({ status: 'failed' })
            .eq('id', id)
        }
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { errorResponse, ErrorCode, getRequestId } from '@/lib/errors'

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8000'

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const supabase = await createClient()

  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })
    }
  }

  const body = await request.json()
  const { projectId, prompt, currentFiles: clientFiles, llmMode, apiModel } = body

  if (!projectId || !prompt) {
    return errorResponse(ErrorCode.VALIDATION_ERROR, 'projectId and prompt are required', { requestId })
  }

  // Get current files: prefer Supabase (authoritative), fall back to client-sent files
  let currentFiles: Record<string, string> = clientFiles || {}
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: project } = await supabase
      .from('projects')
      .select('generated_files')
      .eq('id', projectId)
      .eq('user_id', user!.id)
      .single()
    if (project?.generated_files) {
      currentFiles = project.generated_files as Record<string, string>
    }
  }

  if (!currentFiles || Object.keys(currentFiles).length === 0) {
    return errorResponse(ErrorCode.VALIDATION_ERROR, 'No existing files found — build the app first', { requestId })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const agentResponse = await fetch(`${AGENT_SERVICE_URL}/iterate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            prompt,
            current_files: currentFiles,
            llm_mode: llmMode || 'cli',
            llm_model: apiModel || null,
          }),
        })

        if (!agentResponse.ok || !agentResponse.body) {
          throw new Error(`Agent service error: ${agentResponse.status}`)
        }

        const reader = agentResponse.body.getReader()
        const decoder = new TextDecoder()
        let lineBuffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue

            try {
              const event = JSON.parse(data)
              sendEvent(event)

              // On complete: persist merged files to Supabase
              if (event.type === 'complete' && supabase && event.files) {
                const mergedFiles = { ...currentFiles, ...event.files }
                await supabase
                  .from('projects')
                  .update({ generated_files: mergedFiles })
                  .eq('id', projectId)
              }
            } catch { /* skip malformed */ }
          }
        }
      } catch (err) {
        sendEvent({ type: 'error', message: (err as Error).message })
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

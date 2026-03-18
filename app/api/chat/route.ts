import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { errorResponse, ErrorCode, getRequestId } from '@/lib/errors'
import { createLogger } from '@/lib/logger'

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8000'
const log = createLogger('api/chat')

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')
  const requestId = getRequestId(request)

  if (!projectId) {
    return errorResponse(ErrorCode.BAD_REQUEST, 'projectId query parameter is required', { requestId })
  }

  const supabase = await createClient()

  // Dev mode: return empty messages when Supabase not configured
  if (!supabase) {
    return NextResponse.json({ messages: [] })
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  return NextResponse.json({ messages: messages || [] })
}

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const supabase = await createClient()

  // In dev mode, skip auth but still run the pipeline
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })
    }
  }

  const body = await request.json()
  const { projectId, content, llmMode, apiModel } = body

  if (!projectId || !content) {
    return errorResponse(ErrorCode.VALIDATION_ERROR, 'projectId and content are required', { requestId })
  }

  log.info('Starting build pipeline', { projectId, llmMode })

  // Get project data (previous files/blueprint) if Supabase available
  let previousFiles = null
  let previousBlueprint = null
  let history: { role: string; content: string }[] = []

  if (supabase) {
    const userId = (await supabase.auth.getUser()).data.user?.id
    const { data: project } = await supabase
      .from('projects')
      .select('id, prompt, status, generated_files, blueprint')
      .eq('id', projectId)
      .eq('user_id', userId!)
      .single()

    if (!project) {
      return errorResponse(ErrorCode.NOT_FOUND, 'Project not found', { requestId })
    }

    previousFiles = project.generated_files || null
    previousBlueprint = project.blueprint || null

    // Save user message
    await supabase.from('messages').insert({
      project_id: projectId,
      role: 'user',
      content,
    })

    // Update project status
    await supabase
      .from('projects')
      .update({ status: 'building' })
      .eq('id', projectId)

    // Get conversation history
    const { data: historyData } = await supabase
      .from('messages')
      .select('role, content')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(20)

    history = historyData || []
  }

  const encoder = new TextEncoder()

  // AbortController lets us cancel the upstream fetch to FastAPI when the
  // client disconnects or the user clicks Stop. Without this, the fetch
  // keeps the Node.js event loop alive and the pipeline keeps running.
  const upstreamAbortController = new AbortController()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const agentResponse = await fetch(`${AGENT_SERVICE_URL}/generate`, {
          method: 'POST',
          signal: upstreamAbortController.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            prompt: content,
            conversation_history: history,
            previous_files: previousFiles,
            previous_blueprint: previousBlueprint,
            llm_mode: llmMode || 'cli',
            llm_model: apiModel || null,
          }),
        })

        if (!agentResponse.ok || !agentResponse.body) {
          throw new Error(`Agent service error: ${agentResponse.status}`)
        }

        const reader = agentResponse.body.getReader()
        const decoder = new TextDecoder()
        let assistantContent = ''
        // Buffer incomplete lines between chunks — large events (e.g. complete with 50+ files)
        // are split across TCP chunks and must be reassembled before JSON.parse
        let lineBuffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split('\n')
          // Keep the last (potentially incomplete) line in the buffer
          lineBuffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue

            try {
              const event = JSON.parse(data)
              // Forward the event to the client
              sendEvent(event)

              // Persist agent events to agent_logs + messages tables (fire-and-forget, only with Supabase)
              if (supabase) {
                if (event.type === 'agent_start') {
                  // Persist agent message with initial metadata
                  supabase.from('messages').insert({
                    project_id: projectId,
                    role: 'agent',
                    content: event.message || `${event.agent} agent started`,
                    agent_name: event.agent,
                    metadata: { status: 'running', startedAt: Date.now() },
                  }).then(() => {}, () => {})

                  supabase.from('agent_logs').insert({
                    project_id: projectId,
                    agent_name: event.agent,
                    status: 'running',
                    input: { prompt: content },
                  }).then(() => {}, () => {})
                }

                // Update agent message metadata with reasoning data
                if (['agent_thinking', 'agent_plan', 'agent_verify', 'agent_complete', 'agent_error'].includes(event.type)) {
                  const metaPatch: Record<string, unknown> = {}
                  if (event.type === 'agent_thinking') metaPatch.thinkingContent = event.content
                  if (event.type === 'agent_plan') metaPatch.planBlock = event.content
                  if (event.type === 'agent_verify') metaPatch.verifyBlock = event.content
                  if (event.type === 'agent_complete') {
                    metaPatch.status = 'complete'
                    metaPatch.durationMs = event.duration_ms
                    metaPatch.completedAt = Date.now()
                  }
                  if (event.type === 'agent_error') {
                    metaPatch.status = 'failed'
                  }

                  // Update the latest agent message for this agent
                  // We use an RPC or raw update on the most recent message
                  supabase.from('messages')
                    .select('id, metadata')
                    .eq('project_id', projectId)
                    .eq('role', 'agent')
                    .eq('agent_name', event.agent)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single()
                    .then(({ data: msg }) => {
                      if (msg) {
                        const merged = { ...(msg.metadata as Record<string, unknown> || {}), ...metaPatch }
                        supabase.from('messages').update({ metadata: merged }).eq('id', msg.id).then(() => {}, () => {})
                      }
                    }, () => {})
                }
                if (event.type === 'agent_complete') {
                  supabase.from('agent_logs')
                    .update({
                      status: 'complete',
                      duration_ms: event.duration_ms,
                      output: { message: event.message },
                    })
                    .eq('project_id', projectId)
                    .eq('agent_name', event.agent)
                    .eq('status', 'running')
                    .then(() => {}, () => {})
                }
                if (event.type === 'agent_error') {
                  supabase.from('agent_logs')
                    .update({ status: 'failed', error: event.message })
                    .eq('project_id', projectId)
                    .eq('agent_name', event.agent)
                    .eq('status', 'running')
                    .then(() => {}, () => {})
                }
                if (event.type === 'agent_retry') {
                  supabase.from('agent_logs')
                    .update({ status: 'retrying', retry_count: event.retry_count })
                    .eq('project_id', projectId)
                    .eq('agent_name', event.agent)
                    .then(() => {}, () => {})
                }
                if (event.type === 'usage') {
                  supabase.from('agent_logs')
                    .update({
                      input_tokens: event.input_tokens,
                      output_tokens: event.output_tokens,
                      cost_usd: event.cost_usd,
                    })
                    .eq('project_id', projectId)
                    .eq('agent_name', event.agent)
                    .then(() => {}, () => {})

                  // Also persist usage to agent message metadata
                  supabase.from('messages')
                    .select('id, metadata')
                    .eq('project_id', projectId)
                    .eq('role', 'agent')
                    .eq('agent_name', event.agent)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single()
                    .then(({ data: msg }) => {
                      if (msg) {
                        const merged = {
                          ...(msg.metadata as Record<string, unknown> || {}),
                          inputTokens: event.input_tokens,
                          outputTokens: event.output_tokens,
                          costUsd: event.cost_usd,
                        }
                        supabase.from('messages').update({ metadata: merged }).eq('id', msg.id).then(() => {}, () => {})
                      }
                    }, () => {})
                }

                // Persist file list to agent message metadata on files_update
                if (event.type === 'files_update' && event.agent) {
                  const fileKeys = Object.keys(event.files || {})
                  supabase.from('messages')
                    .select('id, metadata')
                    .eq('project_id', projectId)
                    .eq('role', 'agent')
                    .eq('agent_name', event.agent)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single()
                    .then(({ data: msg }) => {
                      if (msg) {
                        const existing = (msg.metadata as Record<string, unknown> || {})
                        const existingFiles = (existing.files as string[]) || []
                        const merged = { ...existing, phase: 'coding', files: [...new Set([...existingFiles, ...fileKeys])] }
                        supabase.from('messages').update({ metadata: merged }).eq('id', msg.id).then(() => {}, () => {})
                      }
                    }, () => {})
                }
              }

              // Accumulate assistant content
              if (event.type === 'text') {
                assistantContent += event.content
              }

              // On complete, save to database (if Supabase available)
              if (event.type === 'complete' && supabase) {
                // Save assistant message
                await supabase.from('messages').insert({
                  project_id: projectId,
                  role: 'assistant',
                  content: assistantContent || 'Build complete! Your app has been generated.',
                })

                // Update project with generated files and blueprint
                if (event.files) {
                  const projectUpdate: Record<string, unknown> = {
                    status: 'complete',
                    generated_files: event.files,
                  }
                  if (event.blueprint) {
                    projectUpdate.blueprint = event.blueprint
                  }
                  await supabase
                    .from('projects')
                    .update(projectUpdate)
                    .eq('id', projectId)

                  // Fire-and-forget version snapshot
                  ;(async () => {
                    try {
                      const { data: last } = await supabase
                        .from('project_versions')
                        .select('version_number')
                        .eq('project_id', projectId)
                        .order('version_number', { ascending: false })
                        .limit(1)
                        .single()

                      await supabase.from('project_versions').insert({
                        project_id: projectId,
                        version_number: (last?.version_number ?? 0) + 1,
                        files: event.files,
                        blueprint: event.blueprint ?? null,
                        prompt: content,
                        file_count: Object.keys(event.files as Record<string, unknown>).length,
                      })
                    } catch (e) {
                      log.error('Failed to save version snapshot', { projectId, error: String(e) })
                    }
                  })()
                }
              }

              if (event.type === 'error' && supabase) {
                await supabase
                  .from('projects')
                  .update({ status: 'failed' })
                  .eq('id', projectId)
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err) {
        const message = (err as Error).message
        log.error('Pipeline stream error', { projectId, error: message, requestId })
        sendEvent({ type: 'error', message })

        if (supabase) {
          await supabase.from('projects').update({ status: 'failed' }).eq('id', projectId)
        }
      } finally {
        controller.close()
      }
    },

    // Called when the client disconnects (browser closes tab, navigates away,
    // or the Stop button aborts the EventSource connection).
    cancel() {
      // 1. Abort the in-flight fetch to FastAPI — this closes the TCP connection
      //    so FastAPI sees a disconnect and its asyncio generator is cancelled.
      upstreamAbortController.abort()

      // 2. Also call the explicit /stop endpoint so FastAPI kills the actual
      //    claude subprocess immediately (asyncio cancel alone doesn't kill it).
      fetch(`${AGENT_SERVICE_URL}/stop/${projectId}`, { method: 'POST' }).catch(() => {})

      log.info('Client disconnected — upstream fetch aborted and stop signal sent', { projectId })
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

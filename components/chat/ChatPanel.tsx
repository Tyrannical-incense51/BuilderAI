'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { Zap, Hammer } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { useChatStore } from '@/lib/store/useChatStore'
import { useProjectStore } from '@/lib/store/useProjectStore'
import { useSettingsStore } from '@/lib/store/useSettingsStore'
import { generateId } from '@/lib/utils'
import { toast } from 'sonner'
import { AGENT_ORDER } from '@/lib/constants/agents'
import type { ChatMessage, AgentMessageMetadata } from '@/lib/store/useChatStore'

// Keywords that signal the user wants a full rebuild, not a quick edit
const REBUILD_SIGNALS = [
  'build me', 'create a new', 'make me a new', 'start over', 'start fresh',
  'rebuild', 'from scratch', 'completely new', 'brand new app',
]

function detectBuildMode(content: string, hasFiles: boolean): 'quick' | 'full' {
  if (!hasFiles) return 'full'
  const lower = content.toLowerCase().trim()
  if (REBUILD_SIGNALS.some(s => lower.includes(s))) return 'full'
  return 'quick'
}

interface ChatPanelProps {
  projectId: string
  autoStartPrompt?: string
}

export function ChatPanel({ projectId, autoStartPrompt }: ChatPanelProps) {
  const {
    messages, addMessage, setMessages, isLoading, setIsLoading,
    streamingMessageId, setStreamingMessageId, appendToMessage, updateMessage,
    setActiveAbortController,
  } = useChatStore()
  const { currentProject, setAgentState, resetAgentStates, setIsBuilding, updateProject, addAgentLog, updateAgentLog, addLiveLog, clearLiveLogs, archiveLiveLogs, setNewFiles, setAgentFiles, clearAgentFiles } = useProjectStore()
  const { llmMode } = useSettingsStore()

  // Per-session model override — defaults to the global settings value
  const [localModel, setLocalModel] = useState(() => useSettingsStore.getState().apiModel)
  // Build mode: 'auto' = detect from message, 'quick' = always iterate, 'full' = always pipeline
  const [buildMode, setBuildMode] = useState<'auto' | 'quick' | 'full'>('auto')

  const scrollRef = useRef<HTMLDivElement>(null)
  // Track setTimeout IDs so we can clear them on unmount (prevents memory leaks)
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([])
  // abortRef is kept in Zustand store so it survives HMR remounts
  const abortRef = useRef<AbortController | null>(null)
  // Use sessionStorage so autoStart survives HMR remounts but resets on new page load
  const autoStartKey = `autoStartFired_${projectId}`
  const autoStartFired = useRef(
    typeof window !== 'undefined' && sessionStorage.getItem(autoStartKey) === 'true'
  )

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(clearTimeout)
      timeoutRefs.current = []
    }
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Core send logic — defined as a stable ref so it can be called any time
  // (including from the auto-start effect) without stale-closure issues
  const storeRef = useRef({
    addMessage, setMessages, setIsLoading, setStreamingMessageId, appendToMessage,
    updateMessage, resetAgentStates, setIsBuilding, setAgentState, updateProject,
    setActiveAbortController, addAgentLog, updateAgentLog, addLiveLog, clearLiveLogs, archiveLiveLogs, setNewFiles, setAgentFiles, clearAgentFiles,
  })
  useEffect(() => {
    storeRef.current = {
      addMessage, setMessages, setIsLoading, setStreamingMessageId, appendToMessage,
      updateMessage, resetAgentStates, setIsBuilding, setAgentState, updateProject,
      setActiveAbortController, addAgentLog, updateAgentLog, addLiveLog, clearLiveLogs, archiveLiveLogs, setNewFiles, setAgentFiles, clearAgentFiles,
    }
  })

  // Quick Edit: single-agent iterate call — no full pipeline
  const sendIterateMessage = useCallback(async (content: string) => {
    const { addMessage, setIsLoading, updateMessage, updateProject, addLiveLog, clearLiveLogs, archiveLiveLogs, setNewFiles } = storeRef.current

    const logTs = () => new Date().toLocaleTimeString('en-US', { hour12: false })

    const userMsg: ChatMessage = {
      id: generateId(), project_id: projectId, role: 'user',
      content, created_at: new Date().toISOString(),
    }
    addMessage(userMsg)
    setIsLoading(true)
    archiveLiveLogs(projectId)
    clearLiveLogs()

    const assistantMsgId = generateId()
    addMessage({
      id: assistantMsgId, project_id: projectId, role: 'assistant',
      content: '', created_at: new Date().toISOString(), isStreaming: true,
    })

    const ctrl = new AbortController()
    abortRef.current = ctrl
    storeRef.current.setActiveAbortController(ctrl)

    try {
      // Send current files so the iterate agent has full context (also used as fallback when no Supabase)
      const currentFiles = (useProjectStore.getState().currentProject?.generated_files ?? {}) as Record<string, string>

      const response = await fetch('/api/iterate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: content,
          currentFiles,
          llmMode: useSettingsStore.getState().llmMode,
          apiModel: localModel,
        }),
        signal: ctrl.signal,
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue
          try {
            const event = JSON.parse(raw)
            if (event.type === 'iterate_start') {
              updateMessage(assistantMsgId, { content: '⚡ Applying changes...' })
              addLiveLog?.(`[${logTs()}] [ITERATE] ▶ ${event.message}`)
            } else if (event.type === 'complete' && event.files) {
              const changedPaths = Object.keys(event.files as Record<string, string>)
              const existingFiles = (useProjectStore.getState().currentProject?.generated_files ?? {}) as Record<string, string>
              const mergedFiles = { ...existingFiles, ...event.files }
              updateProject(projectId, { generated_files: mergedFiles })
              setNewFiles?.(changedPaths)
              timeoutRefs.current.push(setTimeout(() => setNewFiles?.([]), 4000))
              changedPaths.forEach(f => addLiveLog?.(`[${logTs()}] [ITERATE] ~ ${f}`))
              updateMessage(assistantMsgId, {
                content: `Done! Updated ${changedPaths.length} file${changedPaths.length !== 1 ? 's' : ''}: ${changedPaths.map(p => p.split('/').pop()).join(', ')}`,
                isStreaming: false,
              })
              toast.success('Quick edit applied!', {
                description: `Updated ${changedPaths.length} file${changedPaths.length !== 1 ? 's' : ''} — preview is refreshing`,
              })
            } else if (event.type === 'error') {
              updateMessage(assistantMsgId, { content: `**Edit failed:** ${event.message}`, isStreaming: false })
              toast.error('Quick edit failed', { description: event.message })
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        toast.warning('Edit stopped')
      } else {
        updateMessage(assistantMsgId, { content: 'Connection lost.', isStreaming: false })
        toast.error('Connection error')
      }
    } finally {
      storeRef.current.setIsLoading(false)
      storeRef.current.setStreamingMessageId(null)
      storeRef.current.setIsBuilding(false)
    }
  }, [projectId, localModel])

  const sendMessage = useCallback(async (content: string) => {
    const {
      addMessage, setIsLoading, setStreamingMessageId, appendToMessage,
      updateMessage, resetAgentStates, setIsBuilding, setAgentState, updateProject,
      addAgentLog, updateAgentLog, addLiveLog, clearLiveLogs, archiveLiveLogs, setNewFiles, clearAgentFiles,
    } = storeRef.current

    const logTs = () => new Date().toLocaleTimeString('en-US', { hour12: false })

    const userMsg: ChatMessage = {
      id: generateId(),
      project_id: projectId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    addMessage(userMsg)
    setIsLoading(true)
    toast.info('Build started', { description: 'AI agents are working on your app...' })

    const assistantMsgId = generateId()
    addMessage({
      id: assistantMsgId,
      project_id: projectId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
      isStreaming: true,
    })
    setStreamingMessageId(assistantMsgId)
    resetAgentStates()
    archiveLiveLogs(projectId)
    clearLiveLogs()
    clearAgentFiles()
    setNewFiles([])
    setIsBuilding(true)

    // Track agent message IDs so we can update metadata as reasoning arrives
    const agentMsgIds: Record<string, string> = {}

    // Helper to update agent message metadata (merges with existing)
    const updateAgentMeta = (agent: string, patch: Partial<AgentMessageMetadata>) => {
      const msgId = agentMsgIds[agent]
      if (!msgId) return
      const msg = useChatStore.getState().messages.find(m => m.id === msgId)
      const existing = (msg?.metadata ?? {}) as unknown as AgentMessageMetadata
      updateMessage(msgId, { metadata: { ...existing, ...patch } })
    }

    const ctrl = new AbortController()
    abortRef.current = ctrl
    storeRef.current.setActiveAbortController(ctrl)  // store in Zustand — survives remount

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          content,
          llmMode: useSettingsStore.getState().llmMode,
          apiModel: localModel,
        }),
        signal: ctrl.signal,
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue

          try {
            const event = JSON.parse(raw)
            switch (event.type) {
              case 'agent_start': {
                const agentMsgId = generateId()
                const startedAt = Date.now()
                agentMsgIds[event.agent] = agentMsgId
                setAgentState(event.agent, { status: 'running', log: event.message, startedAt })
                toast.loading(`${event.agent} agent started...`, { id: `agent-${event.agent}` })
                addLiveLog?.(`[${logTs()}] [${event.agent.toUpperCase()}] ▶ ${event.message}`)
                addMessage({
                  id: agentMsgId,
                  project_id: projectId,
                  role: 'agent',
                  content: event.message,
                  agent_name: event.agent,
                  created_at: new Date().toISOString(),
                  metadata: { status: 'running', startedAt, log: event.message } as unknown as Record<string, unknown>,
                })
                addAgentLog?.({
                  id: generateId(),
                  project_id: projectId,
                  agent_name: event.agent,
                  status: 'running',
                  retry_count: 0,
                  created_at: new Date().toISOString(),
                })
                break
              }
              case 'agent_complete': {
                setAgentState(event.agent, {
                  status: 'complete',
                  log: event.message,
                  durationMs: event.duration_ms,
                  completedAt: Date.now(),
                })
                updateAgentMeta(event.agent, {
                  status: 'complete',
                  log: event.message,
                  durationMs: event.duration_ms,
                  completedAt: Date.now(),
                })
                toast.success(`${event.agent} agent complete`, {
                  id: `agent-${event.agent}`,
                  description: event.duration_ms ? `Finished in ${(event.duration_ms / 1000).toFixed(1)}s` : undefined,
                })
                const durStr = event.duration_ms ? ` (${(event.duration_ms / 1000).toFixed(1)}s)` : ''
                addLiveLog?.(`[${logTs()}] [${event.agent.toUpperCase()}] ✓ ${event.message}${durStr}`)
                updateAgentLog?.(event.agent, {
                  status: 'complete',
                  duration_ms: event.duration_ms,
                  output: { message: event.message },
                })
                break
              }
              case 'agent_error':
                setAgentState(event.agent, { status: 'failed', log: event.message })
                updateAgentMeta(event.agent, { status: 'failed', log: event.message })
                toast.error(`${event.agent} agent failed`, {
                  id: `agent-${event.agent}`,
                  description: event.message,
                })
                addLiveLog?.(`[${logTs()}] [${event.agent.toUpperCase()}] ✗ ERROR: ${event.message}`)
                updateAgentLog?.(event.agent, {
                  status: 'failed',
                  error: event.message,
                })
                break
              case 'agent_retry':
                setAgentState(event.agent, {
                  status: 'retrying',
                  retryCount: event.retry_count,
                  log: event.message,
                })
                updateAgentMeta(event.agent, { status: 'retrying', retryCount: event.retry_count, log: event.message })
                addLiveLog?.(`[${logTs()}] [${event.agent.toUpperCase()}] ↺ ${event.message}`)
                updateAgentLog?.(event.agent, {
                  status: 'retrying',
                  retry_count: event.retry_count,
                })
                break
              case 'usage':
                setAgentState(event.agent, {
                  inputTokens: event.input_tokens,
                  outputTokens: event.output_tokens,
                  costUsd: event.cost_usd,
                })
                updateAgentMeta(event.agent, {
                  inputTokens: event.input_tokens,
                  outputTokens: event.output_tokens,
                  costUsd: event.cost_usd,
                })
                addLiveLog?.(`[${logTs()}] [${event.agent.toUpperCase()}] 💰 ${event.output_tokens?.toLocaleString()} tokens · $${event.cost_usd?.toFixed(4)}`)
                break
              case 'agent_thinking':
                setAgentState(event.agent, {
                  phase: 'thinking',
                  thinkingContent: event.content,
                  log: '🧠 Reasoning about component architecture...',
                })
                updateAgentMeta(event.agent, { phase: 'thinking', thinkingContent: event.content })
                addLiveLog?.(`[${logTs()}] [${event.agent.toUpperCase()}] 🧠 Extended thinking (${event.content?.length ?? 0} chars)`)
                break
              case 'agent_plan':
                setAgentState(event.agent, {
                  phase: 'planning',
                  planBlock: event.content,
                  log: '📋 Planning file structure & dependencies...',
                })
                updateAgentMeta(event.agent, { phase: 'planning', planBlock: event.content })
                addLiveLog?.(`[${logTs()}] [${event.agent.toUpperCase()}] 📋 PLAN block captured`)
                break
              case 'agent_verify':
                setAgentState(event.agent, {
                  phase: 'verifying',
                  verifyBlock: event.content,
                  log: '✅ Verifying imports, directives & syntax...',
                })
                updateAgentMeta(event.agent, { phase: 'verifying', verifyBlock: event.content })
                addLiveLog?.(`[${logTs()}] [${event.agent.toUpperCase()}] ✅ VERIFY block captured`)
                break
              case 'text':
                appendToMessage(assistantMsgId, event.content)
                break
              case 'files_update': {
                // Set phase to 'coding' when files arrive (agent is generating code)
                const incomingFileKeys = Object.keys(event.files || {})
                if (event.agent) {
                  setAgentState(event.agent, {
                    phase: 'coding',
                    log: `💻 Generated ${incomingFileKeys.length} files`,
                  })
                  // Track per-agent file list for AgentActionCard
                  storeRef.current.setAgentFiles?.(event.agent, incomingFileKeys)
                  // Persist files list into message metadata
                  const msgId = agentMsgIds[event.agent]
                  if (msgId) {
                    const msg = useChatStore.getState().messages.find(m => m.id === msgId)
                    const existing = (msg?.metadata ?? {}) as unknown as AgentMessageMetadata
                    const existingFiles = existing.files || []
                    const merged = [...new Set([...existingFiles, ...incomingFileKeys])]
                    updateMessage(msgId, { metadata: { ...existing, phase: 'coding', files: merged } })
                  }
                }
                const existingFiles = useProjectStore.getState().currentProject?.generated_files as Record<string, string> | undefined
                const existingKeys = new Set(Object.keys(existingFiles || {}))
                const incomingFiles = event.files as Record<string, string>
                const added = incomingFileKeys.filter(k => !existingKeys.has(k))
                const updated = incomingFileKeys.filter(k => existingKeys.has(k))
                updateProject(projectId, { generated_files: { ...(existingFiles || {}), ...incomingFiles } })
                if (added.length > 0) {
                  setNewFiles?.(added)
                  added.forEach(f => addLiveLog?.(`[${logTs()}] [FILE] + ${f}`))
                  timeoutRefs.current.push(setTimeout(() => setNewFiles?.([]), 4000))
                }
                if (updated.length > 0) {
                  updated.forEach(f => addLiveLog?.(`[${logTs()}] [FILE] ~ ${f}`))
                }
                break
              }
              case 'complete': {
                const completeFiles = event.files as Record<string, string> || {}
                const fileKeys = Object.keys(completeFiles)
                const fileCount = fileKeys.length
                updateProject(projectId, { status: 'complete', generated_files: completeFiles })

                // Mark ALL agents as complete (in case any agent_complete events were missed)
                AGENT_ORDER.forEach(agentName => {
                  const currentState = useProjectStore.getState().agentStates[agentName]
                  if (currentState.status === 'running' || currentState.status === 'retrying') {
                    setAgentState(agentName, {
                      status: 'complete',
                      completedAt: Date.now(),
                      durationMs: currentState.startedAt ? Date.now() - currentState.startedAt : undefined,
                    })
                    // Also update message metadata so cards show complete after reload
                    updateAgentMeta(agentName, {
                      status: 'complete',
                      completedAt: Date.now(),
                      durationMs: currentState.startedAt ? Date.now() - currentState.startedAt : undefined,
                    })
                  }
                })

                // Build rich completion summary
                const agentStatesSnap = useProjectStore.getState().agentStates
                const totalCost = Object.values(agentStatesSnap).reduce((sum, a) => sum + (a.costUsd || 0), 0)
                const totalDuration = Object.values(agentStatesSnap).reduce((max, a) => Math.max(max, a.durationMs || 0), 0)
                const srcFiles = fileKeys.filter(f => f.startsWith('src/'))
                const configFiles = fileKeys.filter(f => !f.startsWith('src/'))

                let summary = `**${currentProject?.name || 'App'} is ready!** 🎉\n\n`
                summary += `**${fileCount} files** generated`
                if (totalDuration > 0) summary += ` in ${(totalDuration / 1000).toFixed(1)}s`
                if (totalCost > 0) summary += ` · $${totalCost.toFixed(3)}`
                summary += '\n\n'
                if (srcFiles.length > 0) {
                  const displayFiles = srcFiles.slice(0, 8)
                  summary += displayFiles.map(f => `\`${f}\``).join(', ')
                  if (srcFiles.length > 8) summary += `, +${srcFiles.length - 8} more`
                  summary += '\n\n'
                }
                summary += `Run \`npm install && npm run dev\` to start your app.`

                updateMessage(assistantMsgId, { content: summary, isStreaming: false })
                setStreamingMessageId(null)
                setIsBuilding(false)
                addLiveLog?.(`[${logTs()}] [PIPELINE] ✓ Build complete — ${fileCount} files generated`)
                ;AGENT_ORDER.forEach(a => toast.dismiss(`agent-${a}`))
                toast.success('Build complete! 🎉', {
                  description: 'Your app is ready — check the preview panel',
                  duration: 5000,
                })
                break
              }
              case 'error': {
                const isApiKeyError = event.message?.toLowerCase().includes('api key') || event.message?.toLowerCase().includes('anthropic_api_key')
                updateMessage(assistantMsgId, {
                  content: `**Build failed:** ${event.message}`,
                  isStreaming: false,
                })
                updateProject(projectId, { status: 'failed' })
                addLiveLog?.(`[${logTs()}] [PIPELINE] ✗ Build failed: ${event.message}`)
                ;AGENT_ORDER.forEach(a => toast.dismiss(`agent-${a}`))
                toast.error('Build failed', {
                  description: event.message,
                  duration: 8000,
                  action: isApiKeyError
                    ? { label: 'Settings', onClick: () => { window.location.href = '/settings' } }
                    : { label: 'Retry', onClick: () => sendMessage(content) },
                })
                break
              }
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Intentional abort (user clicked Stop) — not an error, no console noise
        toast.warning('Build stopped', { description: 'Build was cancelled' })
      } else {
        console.error('[ChatPanel] sendMessage error:', err)
        storeRef.current.updateMessage(assistantMsgId, {
          content: 'Connection lost. The build server may be unreachable.',
          isStreaming: false,
        })
        storeRef.current.updateProject(projectId, { status: 'failed' })
        toast.error('Connection error', {
          description: 'Lost connection to the build server',
          duration: 8000,
          action: { label: 'Retry', onClick: () => sendMessage(content) },
        })
      }
    } finally {
      storeRef.current.setIsLoading(false)
      storeRef.current.setStreamingMessageId(null)
      storeRef.current.setIsBuilding(false)
      // Force-stop any agents still stuck in 'running' state
      const finalStates = useProjectStore.getState().agentStates
      AGENT_ORDER.forEach(agentName => {
        if (finalStates[agentName].status === 'running' || finalStates[agentName].status === 'retrying') {
          storeRef.current.setAgentState(agentName, {
            status: 'complete',
            completedAt: Date.now(),
            durationMs: finalStates[agentName].startedAt ? Date.now() - finalStates[agentName].startedAt : undefined,
          })
        }
      })
      // Always clean up any lingering agent loading toasts
      ;AGENT_ORDER.forEach(a => toast.dismiss(`agent-${a}`))
    }
  }, [projectId, localModel])

  // Route to quick-edit or full pipeline based on buildMode + message intent
  const handleSend = useCallback((content: string) => {
    const hasFiles = Object.keys(
      (useProjectStore.getState().currentProject?.generated_files ?? {}) as Record<string, string>
    ).length > 0
    const resolved = buildMode === 'auto' ? detectBuildMode(content, hasFiles) : buildMode
    if (resolved === 'quick') {
      sendIterateMessage(content)
    } else {
      sendMessage(content)
    }
  }, [buildMode, sendIterateMessage, sendMessage])

  const handleStop = useCallback(() => {
    // Abort via both local ref and store (in case of remount)
    abortRef.current?.abort()
    useChatStore.getState().activeAbortController?.abort()
    storeRef.current.setActiveAbortController(null)
    storeRef.current.setIsLoading(false)
    storeRef.current.setStreamingMessageId(null)
    storeRef.current.setIsBuilding(false)
    storeRef.current.resetAgentStates()
    ;AGENT_ORDER.forEach(a => toast.dismiss(`agent-${a}`))
  }, [])

  // Load chat history — then auto-start build if this is a fresh project
  useEffect(() => {
    let cancelled = false
    // Bail out immediately if already fired — don't even fetch
    if (autoStartFired.current) return

    async function init() {
      const res = await fetch(`/api/chat?projectId=${projectId}`)
      if (!res.ok || cancelled) return

      const data = await res.json()
      if (cancelled) return

      const loaded: ChatMessage[] = data.messages || []
      storeRef.current.setMessages(loaded)

      if (autoStartPrompt && loaded.length === 0 && !autoStartFired.current) {
        // Guard SYNCHRONOUSLY before any await — prevents StrictMode double-fire
        autoStartFired.current = true
        sessionStorage.setItem(autoStartKey, 'true')
        if (!cancelled) await sendMessage(autoStartPrompt)
      }
    }

    init()

    return () => {
      cancelled = true
      // Do NOT abort the stream here — HMR remounts would kill an active build
      // The stream is only aborted by handleStop (user action)
    }
  }, [projectId, autoStartPrompt, sendMessage]) // removed setMessages — use storeRef instead

  const isFailed = currentProject?.status === 'failed' && !isLoading

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="text-4xl mb-4">🚀</div>
            <h3 className="font-semibold text-lg mb-2">Ready to build</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Describe your app in natural language and watch the AI agents build it in real-time.
            </p>
          </div>
        )}
        {messages.map((msg, idx) => {
          const prev = idx > 0 ? messages[idx - 1] : null
          const isGrouped = prev?.role === msg.role && msg.role !== 'agent'
          return <MessageBubble key={msg.id} message={msg} isGrouped={isGrouped} />
        })}
      </div>

      {/* Retry banner — shown when last build failed */}
      {isFailed && currentProject?.prompt && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-between gap-2">
          <span className="text-xs text-destructive/80">Last build failed</span>
          <button
            onClick={() => sendMessage(currentProject.prompt)}
            className="text-xs font-medium text-destructive hover:text-destructive/80 underline-offset-2 hover:underline"
          >
            Retry Build
          </button>
        </div>
      )}

      {/* Mode toggle — only show when project has files */}
      {currentProject?.generated_files && Object.keys(currentProject.generated_files).length > 0 && !isLoading && (
        <div className="flex items-center gap-1.5 px-4 pb-1">
          <button
            onClick={() => setBuildMode(m => m === 'full' ? 'auto' : 'full')}
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
              buildMode === 'full'
                ? 'bg-orange-500/15 border-orange-500/40 text-orange-400 hover:bg-orange-500/25'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            }`}
            title={buildMode === 'full' ? 'Click to switch to Quick Edit mode' : 'Click to switch to Full Rebuild mode'}
          >
            {buildMode === 'full'
              ? <><Hammer className="w-2.5 h-2.5" /> Full Rebuild</>
              : <><Zap className="w-2.5 h-2.5" /> Quick Edit</>
            }
          </button>
          <span className="text-[10px] text-muted-foreground">
            {buildMode === 'full' ? 'runs all 6 agents' : 'auto-detects intent'}
          </span>
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        disabled={isLoading && !streamingMessageId}
        isStreaming={!!streamingMessageId}
        placeholder={
          currentProject?.status === 'complete'
            ? buildMode === 'full' ? 'Describe full rebuild...' : 'Describe a quick change...'
            : 'Describe the app you want to build...'
        }
        selectedModel={llmMode === 'api' ? localModel : undefined}
        onModelChange={llmMode === 'api' ? setLocalModel : undefined}
      />
    </div>
  )
}

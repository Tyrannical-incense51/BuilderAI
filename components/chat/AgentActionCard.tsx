'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Loader2, Check, X, RotateCcw, FileCode2, Brain, ClipboardList, ShieldCheck, Code2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore, type AgentName, type AgentPhase } from '@/lib/store/useProjectStore'
import { AGENT_CONFIG } from '@/lib/constants/agents'
import type { ChatMessage, AgentMessageMetadata } from '@/lib/store/useChatStore'

const EMPTY_FILES: string[] = []

interface AgentActionCardProps {
  agentName: string
  message: ChatMessage
}

const PHASES: { key: AgentPhase; icon: typeof Brain; label: string }[] = [
  { key: 'thinking', icon: Brain, label: 'Think' },
  { key: 'planning', icon: ClipboardList, label: 'Plan' },
  { key: 'coding', icon: Code2, label: 'Code' },
  { key: 'verifying', icon: ShieldCheck, label: 'Verify' },
]

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function AgentActionCard({ agentName, message }: AgentActionCardProps) {
  const liveState = useProjectStore((s) => s.agentStates[agentName as AgentName])
  const liveFiles = useProjectStore((s) => s.agentFiles[agentName] ?? EMPTY_FILES)
  const config = AGENT_CONFIG[agentName as keyof typeof AGENT_CONFIG]

  // Persisted metadata from the message itself (survives across builds & reloads)
  const meta = message.metadata as AgentMessageMetadata | undefined

  // Determine if this agent is currently live (active build)
  const isLive = liveState?.status === 'running' || liveState?.status === 'retrying'
  const useLive = isLive && liveState

  // Merge: use live state during active build, fall back to persisted metadata
  const status = useLive ? liveState.status : (meta?.status ?? (liveState?.status !== 'idle' ? liveState?.status : null) ?? 'complete')
  const phase = useLive ? liveState.phase : meta?.phase
  const thinkingContent = useLive ? liveState.thinkingContent : meta?.thinkingContent
  const planBlock = useLive ? liveState.planBlock : meta?.planBlock
  const verifyBlock = useLive ? liveState.verifyBlock : meta?.verifyBlock
  const durationMs = useLive ? liveState.durationMs : (meta?.durationMs ?? liveState?.durationMs)
  const startedAt = useLive ? liveState.startedAt : meta?.startedAt
  const costUsd = useLive ? liveState.costUsd : (meta?.costUsd ?? liveState?.costUsd)
  const inputTokens = useLive ? liveState.inputTokens : (meta?.inputTokens ?? liveState?.inputTokens)
  const outputTokens = useLive ? liveState.outputTokens : (meta?.outputTokens ?? liveState?.outputTokens)
  const log = useLive ? liveState.log : (meta?.log ?? message.content)
  const filesList = useLive ? liveFiles : (meta?.files ?? EMPTY_FILES)

  const [expanded, setExpanded] = useState(false)
  const [filesExpanded, setFilesExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  // Live elapsed timer — only ticks while status is 'running'
  useEffect(() => {
    if (status !== 'running' || !startedAt) {
      setElapsed(0)
      return
    }
    setElapsed(Date.now() - startedAt)
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt)
    }, 100)
    return () => clearInterval(interval)
  }, [status, startedAt])

  if (!config) {
    return (
      <div className="text-sm text-muted-foreground px-3 py-2 bg-secondary/50 rounded-lg border border-border/50">
        {message.content}
      </div>
    )
  }

  const Icon = config.icon
  const isRunning = status === 'running'
  const isComplete = status === 'complete'
  const isFailed = status === 'failed'
  const isRetrying = status === 'retrying'
  const isLLM = config.isLLM
  const duration = durationMs ? formatElapsed(durationMs) : isRunning ? formatElapsed(elapsed) : null
  const hasReasoning = !!(thinkingContent || planBlock || verifyBlock)
  const hasExpandable = hasReasoning || filesList.length > 0

  // Determine which phase index we're at
  const currentPhaseIdx = phase ? PHASES.findIndex((p) => p.key === phase) : -1

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className={cn(
        'rounded-xl border overflow-hidden transition-all duration-300',
        isRunning && 'border-yellow-500/30 bg-gradient-to-r from-yellow-500/[0.04] to-transparent shadow-[0_0_20px_rgba(234,179,8,0.04)]',
        isComplete && 'border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.04] to-transparent',
        isFailed && 'border-red-500/25 bg-gradient-to-r from-red-500/[0.04] to-transparent',
        isRetrying && 'border-orange-500/25 bg-gradient-to-r from-orange-500/[0.04] to-transparent',
        !isRunning && !isComplete && !isFailed && !isRetrying && 'border-border/50 bg-secondary/20',
      )}>
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-2.5 px-3 py-2 transition-colors',
            hasExpandable && 'cursor-pointer hover:bg-white/[0.03]'
          )}
          onClick={() => hasExpandable && setExpanded(!expanded)}
        >
          {/* Status icon */}
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300',
            isRunning && 'bg-yellow-500/10',
            isComplete && 'bg-emerald-500/10',
            isFailed && 'bg-red-500/10',
            isRetrying && 'bg-orange-500/10',
            !isRunning && !isComplete && !isFailed && !isRetrying && config.bgColor,
          )}>
            {isRunning ? (
              <Loader2 className={cn('w-3.5 h-3.5 animate-spin', config.color)} />
            ) : isComplete ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : isFailed ? (
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            ) : isRetrying ? (
              <RotateCcw className="w-3.5 h-3.5 text-orange-400 animate-spin" />
            ) : (
              <Icon className={cn('w-3.5 h-3.5', config.color)} />
            )}
          </div>

          {/* Agent name + log message */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'text-[13px] font-semibold leading-tight',
                isComplete ? 'text-emerald-400/90' :
                isRunning ? config.color :
                isFailed ? 'text-red-400/90' :
                config.color
              )}>
                {config.label}
              </span>
              {config.isLLM === false && (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-500/8 text-cyan-400/70 border border-cyan-500/15">
                  instant
                </span>
              )}
              {isComplete && filesList.length > 0 && (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-violet-500/8 text-violet-400/80 border border-violet-500/15">
                  {filesList.length} file{filesList.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className={cn(
              'text-[11px] truncate mt-0.5 leading-tight',
              isRunning ? 'text-yellow-400/60' :
              isComplete ? 'text-muted-foreground/70' :
              'text-muted-foreground/60'
            )}>
              {log}
            </p>
          </div>

          {/* Right side badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Duration badge */}
            {duration && (
              <span className={cn(
                'text-[10px] font-mono px-1.5 py-0.5 rounded-md',
                isRunning ? 'bg-yellow-500/10 text-yellow-400/80' : 'text-muted-foreground/60'
              )}>
                {duration}
              </span>
            )}

            {/* Cost badge */}
            {costUsd != null && costUsd > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md text-muted-foreground/50">
                ${costUsd.toFixed(3)}
              </span>
            )}

            {/* Expand chevron */}
            {hasExpandable && (
              <ChevronDown className={cn(
                'w-3 h-3 text-muted-foreground/40 transition-transform duration-200',
                expanded && 'rotate-180'
              )} />
            )}
          </div>
        </div>

        {/* Phase stepper — compact pill row for LLM agents */}
        {isLLM && (isRunning || isComplete || isFailed) && (
          <div className="flex items-center gap-0.5 px-3 pb-2">
            {PHASES.map((p, i) => {
              const PhaseIcon = p.icon
              const isActive = i === currentPhaseIdx
              const isDone = i < currentPhaseIdx || (isComplete && currentPhaseIdx === -1) || isComplete
              return (
                <div key={p.key} className="flex items-center gap-0.5">
                  {i > 0 && <div className={cn(
                    'w-2 h-px transition-colors duration-300',
                    isDone ? 'bg-emerald-500/30' : 'bg-border/30'
                  )} />}
                  <div className={cn(
                    'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-all duration-300',
                    isActive && isRunning ? 'bg-violet-500/15 text-violet-400' :
                    isDone ? 'text-emerald-500/60' :
                    'text-muted-foreground/30'
                  )}>
                    {isDone && !isActive ? (
                      <Check className="w-2 h-2" />
                    ) : isActive && isRunning ? (
                      <Loader2 className="w-2 h-2 animate-spin" />
                    ) : (
                      <PhaseIcon className="w-2 h-2" />
                    )}
                    <span>{p.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/20 px-3 py-2.5 space-y-2">
                {/* Reasoning blocks */}
                {thinkingContent && (
                  <ReasoningBlock
                    icon={<Brain className="w-3 h-3 text-violet-400/70" />}
                    label="Thought process"
                    content={thinkingContent}
                    accentColor="violet"
                  />
                )}
                {planBlock && (
                  <ReasoningBlock
                    icon={<ClipboardList className="w-3 h-3 text-blue-400/70" />}
                    label="Plan"
                    content={planBlock}
                    accentColor="blue"
                  />
                )}
                {verifyBlock && (
                  <ReasoningBlock
                    icon={<ShieldCheck className="w-3 h-3 text-emerald-400/70" />}
                    label="Verification"
                    content={verifyBlock}
                    accentColor="emerald"
                  />
                )}

                {/* Files list */}
                {filesList.length > 0 && (
                  <div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFilesExpanded(!filesExpanded) }}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors w-full"
                    >
                      <FileCode2 className="w-3 h-3 text-cyan-400/60" />
                      <span>
                        {isComplete ? 'Generated' : 'Generating'} {filesList.length} file{filesList.length !== 1 ? 's' : ''}
                      </span>
                      <ChevronDown className={cn(
                        'w-3 h-3 ml-auto transition-transform duration-200',
                        !filesExpanded && '-rotate-90'
                      )} />
                    </button>
                    <AnimatePresence>
                      {filesExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-1.5 space-y-px max-h-48 overflow-y-auto">
                            {filesList.map((f) => (
                              <div key={f} className="text-[10px] text-muted-foreground/60 font-mono flex items-center gap-1.5 py-0.5 px-2 rounded hover:bg-white/[0.03] transition-colors">
                                <FileCode2 className="w-2.5 h-2.5 text-cyan-400/40 shrink-0" />
                                <span className="truncate">{f}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Token usage */}
                {inputTokens != null && (
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground/40 font-mono pt-1.5 border-t border-border/15">
                    <Sparkles className="w-2.5 h-2.5" />
                    {inputTokens?.toLocaleString()} in · {outputTokens?.toLocaleString()} out
                    {costUsd != null && costUsd > 0 && ` · $${costUsd.toFixed(4)}`}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/** Collapsible reasoning block with accent border */
function ReasoningBlock({
  icon,
  label,
  content,
  accentColor,
}: {
  icon: React.ReactNode
  label: string
  content: string
  accentColor: 'violet' | 'blue' | 'emerald'
}) {
  const [open, setOpen] = useState(false)
  const preview = content.slice(0, 150) + (content.length > 150 ? '...' : '')

  const borderColor = {
    violet: 'border-l-violet-500/30',
    blue: 'border-l-blue-500/30',
    emerald: 'border-l-emerald-500/30',
  }[accentColor]

  return (
    <div className={cn('border-l-2 pl-2.5 rounded-sm', borderColor)}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors w-full"
      >
        {icon}
        <span>{label}</span>
        <ChevronDown className={cn(
          'w-3 h-3 ml-auto transition-transform duration-200',
          !open && '-rotate-90'
        )} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 text-[10px] text-muted-foreground/60 font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto pr-1">
              {content}
            </div>
          </motion.div>
        ) : (
          <p className="mt-0.5 text-[10px] text-muted-foreground/40 font-mono line-clamp-1 leading-relaxed">
            {preview}
          </p>
        )}
      </AnimatePresence>
    </div>
  )
}

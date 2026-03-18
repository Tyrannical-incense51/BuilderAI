'use client'

import { useState, useEffect, Fragment } from 'react'
import {
  CheckCircle2, XCircle, Loader2, Circle, RefreshCw, ChevronDown, Zap,
  Brain, ClipboardList, Code2, ShieldCheck, Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AGENT_CONFIG } from '@/lib/constants/agents'
import type { AgentState, AgentPhase } from '@/lib/store/useProjectStore'

function formatDuration(ms: number): string {
  const secs = ms / 1000
  if (secs < 1) return '<1s'
  if (secs < 60) return `${secs.toFixed(1)}s`
  const mins = Math.floor(secs / 60)
  const remainSecs = (secs % 60).toFixed(0)
  return `${mins}m ${remainSecs}s`
}

const PHASE_STEPS: { key: AgentPhase; label: string; icon: typeof Brain }[] = [
  { key: 'thinking', label: 'Think', icon: Brain },
  { key: 'planning', label: 'Plan', icon: ClipboardList },
  { key: 'coding', label: 'Code', icon: Code2 },
  { key: 'verifying', label: 'Verify', icon: ShieldCheck },
]

function getPhaseIndex(phase?: AgentPhase): number {
  if (!phase) return -1
  return PHASE_STEPS.findIndex(s => s.key === phase)
}

interface AgentStatusCardProps {
  agentState: AgentState
  showConnector?: boolean
  nextAgentActive?: boolean
}

export function AgentStatusCard({ agentState, showConnector = true, nextAgentActive = false }: AgentStatusCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [liveElapsed, setLiveElapsed] = useState(0)
  const [reasoningTab, setReasoningTab] = useState<'plan' | 'verify'>('plan')
  const config = AGENT_CONFIG[agentState.name]
  const AgentIcon = config.icon

  // Live elapsed counter while running
  useEffect(() => {
    if (agentState.status !== 'running' && agentState.status !== 'retrying') {
      setLiveElapsed(0)
      return
    }
    const start = agentState.startedAt ?? Date.now()
    setLiveElapsed(Date.now() - start)
    const interval = setInterval(() => setLiveElapsed(Date.now() - start), 500)
    return () => clearInterval(interval)
  }, [agentState.status, agentState.startedAt])

  const isActive = agentState.status === 'running' || agentState.status === 'retrying'
  const isComplete = agentState.status === 'complete'
  const isFailed = agentState.status === 'failed'
  const isIdle = agentState.status === 'idle'
  const hasLog = agentState.log && agentState.log.length > 0
  const hasReasoning = !!(agentState.planBlock || agentState.verifyBlock || agentState.thinkingContent)
  const isClickable = (hasLog || hasReasoning) && !isIdle
  const showPhases = config.isLLM && (isActive || isComplete) && agentState.phase

  const durationMs = agentState.durationMs
    ?? (agentState.startedAt && agentState.completedAt
      ? agentState.completedAt - agentState.startedAt
      : null)

  const currentPhaseIndex = getPhaseIndex(agentState.phase)

  return (
    <div className="relative">
      <div
        onClick={() => isClickable && setExpanded(!expanded)}
        className={cn(
          'rounded-xl border p-2.5 transition-all duration-300',
          isClickable && 'cursor-pointer hover:bg-white/[0.03]',
          isIdle && 'bg-secondary/20 border-border/30 opacity-40',
          agentState.status === 'running' && 'border-yellow-400/30 bg-gradient-to-r from-yellow-400/[0.04] to-transparent shadow-[0_0_15px_rgba(250,204,21,0.05)]',
          isComplete && 'bg-gradient-to-r from-emerald-400/[0.04] to-transparent border-emerald-400/20',
          isFailed && 'bg-gradient-to-r from-red-400/[0.04] to-transparent border-red-400/25',
          agentState.status === 'retrying' && 'border-orange-400/30 bg-gradient-to-r from-orange-400/[0.04] to-transparent',
        )}
      >
        <div className="flex items-center gap-2.5">
          {/* Agent icon */}
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300',
            isIdle && 'bg-muted/50',
            agentState.status === 'running' && 'bg-yellow-400/10',
            isComplete && 'bg-emerald-400/10',
            isFailed && 'bg-red-400/10',
            agentState.status === 'retrying' && 'bg-orange-400/10',
          )}>
            <AgentIcon className={cn(
              'w-3.5 h-3.5 transition-colors',
              isIdle ? 'text-muted-foreground/50' : config.color
            )} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'text-[13px] font-medium leading-tight',
                isIdle ? 'text-muted-foreground/60' :
                isComplete ? 'text-foreground/90' :
                'text-foreground'
              )}>
                {config.label}
              </span>
              {!config.isLLM && isComplete && (
                <span className="flex items-center gap-0.5 text-[9px] font-medium text-cyan-400/70 bg-cyan-400/8 px-1.5 py-0.5 rounded-full border border-cyan-400/15">
                  <Zap className="w-2.5 h-2.5" />
                  instant
                </span>
              )}
              {agentState.status === 'retrying' && (
                <span className="text-[9px] font-semibold text-amber-400/90 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full animate-pulse">
                  Retry {agentState.retryCount}
                </span>
              )}
              {agentState.retryCount > 0 && agentState.status !== 'retrying' && (
                <span className="text-[9px] text-orange-400/70 bg-orange-400/8 px-1.5 py-0.5 rounded-full">
                  {agentState.retryCount}x
                </span>
              )}
            </div>
            <p className={cn(
              'text-[11px] truncate leading-tight mt-0.5',
              agentState.status === 'running' ? 'text-yellow-400/60' :
              agentState.status === 'retrying' ? 'text-orange-400/60' :
              isComplete ? 'text-muted-foreground/60' :
              'text-muted-foreground/50'
            )}>
              {isIdle ? config.description : (agentState.log || config.description)}
            </p>
          </div>

          {/* Right side: status + metrics */}
          <div className="flex items-center gap-1.5 shrink-0">
            {durationMs !== null && isComplete && (
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                {formatDuration(durationMs)}
              </span>
            )}
            {isActive && liveElapsed > 0 && (
              <span className="text-[10px] text-yellow-400/80 font-mono">
                {formatDuration(liveElapsed)}
              </span>
            )}
            {isComplete && agentState.outputTokens && (
              <span className="text-[9px] text-blue-400/60 bg-blue-400/8 px-1 py-0.5 rounded font-mono">
                {(agentState.outputTokens / 1000).toFixed(1)}k
              </span>
            )}
            {/* Status icon */}
            {isIdle ? (
              <Circle className="w-3.5 h-3.5 text-muted-foreground/25 shrink-0" />
            ) : agentState.status === 'running' ? (
              <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin shrink-0" />
            ) : isComplete ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : isFailed ? (
              <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            ) : agentState.status === 'retrying' ? (
              <RefreshCw className="w-3.5 h-3.5 text-orange-400 animate-spin shrink-0" />
            ) : null}
            {isClickable && (
              <ChevronDown className={cn(
                'w-3 h-3 text-muted-foreground/30 transition-transform duration-200',
                expanded && 'rotate-180'
              )} />
            )}
          </div>
        </div>

        {/* Phase stepper */}
        {showPhases && (
          <div className="flex items-center gap-0.5 mt-2 px-0.5">
            {PHASE_STEPS.map((step, i) => {
              const StepIcon = step.icon
              const isCurrentPhase = agentState.phase === step.key
              const isPast = currentPhaseIndex > i
              const isCompleteAgent = isComplete

              return (
                <Fragment key={step.key}>
                  <div className="flex items-center gap-0.5">
                    <div className={cn(
                      'w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300',
                      (isPast || isCompleteAgent) ? 'bg-emerald-500/15' :
                      isCurrentPhase ? 'bg-violet-500/20 shadow-[0_0_6px_rgba(139,92,246,0.3)]' :
                      'bg-muted/30',
                    )}>
                      {(isPast || isCompleteAgent) ? (
                        <Check className="w-2.5 h-2.5 text-emerald-400/70" />
                      ) : isCurrentPhase && isActive ? (
                        <Loader2 className="w-2.5 h-2.5 text-violet-400 animate-spin" />
                      ) : (
                        <StepIcon className={cn(
                          'w-2.5 h-2.5 transition-colors duration-300',
                          isCurrentPhase ? 'text-violet-300' : 'text-muted-foreground/30'
                        )} />
                      )}
                    </div>
                    <span className={cn(
                      'text-[9px] transition-colors duration-300',
                      isCurrentPhase && isActive ? 'text-violet-400 font-medium' :
                      (isPast || isCompleteAgent) ? 'text-emerald-400/50' :
                      'text-muted-foreground/30'
                    )}>
                      {step.label}
                    </span>
                  </div>
                  {i < PHASE_STEPS.length - 1 && (
                    <div className={cn(
                      'flex-1 h-px max-w-3 transition-colors duration-300',
                      (isPast || isCompleteAgent) ? 'bg-emerald-400/20' : 'bg-muted-foreground/10'
                    )} />
                  )}
                </Fragment>
              )
            })}
          </div>
        )}

        {/* Expandable content */}
        <div
          className={cn(
            'grid transition-all duration-200 ease-in-out',
            expanded && (hasLog || hasReasoning) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <div className="mt-2 pt-2 border-t border-border/20">
              {hasLog && !hasReasoning && (
                <p className="text-[10px] text-muted-foreground/60 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
                  {agentState.log}
                </p>
              )}

              {hasReasoning && (
                <div>
                  <div className="flex gap-1 mb-1.5">
                    {agentState.thinkingContent && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setReasoningTab('plan') }}
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded-md transition-colors',
                          reasoningTab === 'plan'
                            ? 'bg-violet-500/15 text-violet-300 font-medium'
                            : 'text-muted-foreground/50 hover:text-foreground/70'
                        )}
                      >
                        Thinking
                      </button>
                    )}
                    {agentState.planBlock && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setReasoningTab('plan') }}
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded-md transition-colors',
                          reasoningTab === 'plan' && !agentState.thinkingContent
                            ? 'bg-violet-500/15 text-violet-300 font-medium'
                            : agentState.thinkingContent
                              ? 'text-muted-foreground/50 hover:text-foreground/70'
                              : 'bg-violet-500/15 text-violet-300 font-medium'
                        )}
                      >
                        Plan
                      </button>
                    )}
                    {agentState.verifyBlock && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setReasoningTab('verify') }}
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded-md transition-colors',
                          reasoningTab === 'verify'
                            ? 'bg-emerald-500/15 text-emerald-300 font-medium'
                            : 'text-muted-foreground/50 hover:text-foreground/70'
                        )}
                      >
                        Verify
                      </button>
                    )}
                  </div>
                  <pre className="text-[9px] text-muted-foreground/50 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto bg-black/15 rounded-lg p-2 leading-relaxed scrollbar-thin">
                    {reasoningTab === 'plan'
                      ? (agentState.planBlock || agentState.thinkingContent || '')
                      : (agentState.verifyBlock || '')}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Connector line */}
      {showConnector && (
        <div className={cn(
          'pipeline-connector',
          nextAgentActive && 'active',
          isComplete && 'done'
        )} />
      )}
    </div>
  )
}

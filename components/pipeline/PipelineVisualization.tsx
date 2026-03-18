'use client'

import { useEffect, useRef, useMemo, useState, memo } from 'react'
import { useProjectStore } from '@/lib/store/useProjectStore'
import { AGENT_ORDER, AGENT_CONFIG } from '@/lib/constants/agents'
import { AgentStatusCard } from './AgentStatusCard'
import { Zap, Clock, DollarSign } from 'lucide-react'

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  if (mins > 0) return `${mins}m ${secs.toString().padStart(2, '0')}s`
  return `${secs}s`
}

export function PipelineVisualization() {
  const { agentStates, isBuilding, currentProject } = useProjectStore()

  const totalCost = Object.values(agentStates).reduce((sum, a) => sum + (a.costUsd ?? 0), 0)

  // Live elapsed timer
  const [elapsed, setElapsed] = useState(0)
  const buildStartRef = useRef<number | null>(null)

  // Track build start time
  useEffect(() => {
    if (isBuilding && !buildStartRef.current) {
      buildStartRef.current = Date.now()
    }
    if (!isBuilding && buildStartRef.current) {
      // Freeze final elapsed
      setElapsed(Date.now() - buildStartRef.current)
    }
  }, [isBuilding])

  // Tick the timer while building
  useEffect(() => {
    if (!isBuilding) return
    const interval = setInterval(() => {
      if (buildStartRef.current) {
        setElapsed(Date.now() - buildStartRef.current)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [isBuilding])

  // Reset timer when agents reset
  useEffect(() => {
    const allIdle = AGENT_ORDER.every(name => agentStates[name].status === 'idle')
    if (allIdle) {
      buildStartRef.current = null
      setElapsed(0)
    }
  }, [agentStates])

  // Refs for each agent card — used for auto-scrolling to active agent
  const cardRefs = useRef(
    Object.fromEntries(AGENT_ORDER.map(name => [name, null])) as Record<string, HTMLDivElement | null>
  )
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // If the project is already complete (loaded from DB), treat all agents as complete
  const isAlreadyComplete = currentProject?.status === 'complete' && !isBuilding
  const effectiveAgentStates = useMemo(
    () =>
      isAlreadyComplete
        ? (Object.fromEntries(
            AGENT_ORDER.map(name => [name, { ...agentStates[name], status: 'complete' as const }])
          ) as typeof agentStates)
        : agentStates,
    [isAlreadyComplete, agentStates]
  )

  const completedCount = isAlreadyComplete
    ? AGENT_ORDER.length
    : Object.values(agentStates).filter(a => AGENT_ORDER.includes(a.name) && a.status === 'complete').length
  const progress = (completedCount / AGENT_ORDER.length) * 100

  // Count LLM vs deterministic agents
  const llmAgents = AGENT_ORDER.filter(n => AGENT_CONFIG[n]?.isLLM)
  const llmComplete = llmAgents.filter(n => effectiveAgentStates[n]?.status === 'complete').length

  // Find the currently active agent (running or retrying) for auto-scroll
  const activeAgent = useMemo(() => {
    return AGENT_ORDER.find(name =>
      effectiveAgentStates[name].status === 'running' ||
      effectiveAgentStates[name].status === 'retrying'
    ) ?? null
  }, [effectiveAgentStates])

  // Auto-scroll to the active agent when it changes
  useEffect(() => {
    if (!activeAgent) return
    const el = cardRefs.current[activeAgent]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeAgent])

  const showStats = isBuilding || elapsed > 0 || totalCost > 0

  return (
    <div ref={scrollContainerRef} className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight text-foreground/90">Pipeline</h3>
          {isBuilding && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-yellow-400/90 bg-yellow-400/8 px-2 py-0.5 rounded-full border border-yellow-400/15">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Building
            </span>
          )}
          {!isBuilding && completedCount === AGENT_ORDER.length && completedCount > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400/90 bg-emerald-400/8 px-2 py-0.5 rounded-full border border-emerald-400/15">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Complete
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-1 bg-secondary/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progress}%`,
                background: progress === 100
                  ? 'linear-gradient(90deg, #34d399, #10b981)'
                  : 'linear-gradient(90deg, #8b5cf6, #3b82f6, #06b6d4)',
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-muted-foreground/50">
            <span>{completedCount}/{AGENT_ORDER.length} steps</span>
            <span>{llmComplete}/{llmAgents.length} LLM calls</span>
          </div>
        </div>

        {/* Stats row */}
        {showStats && (
          <div className="flex items-center gap-3 text-[10px]">
            {(isBuilding || elapsed > 0) && (
              <span className="flex items-center gap-1 text-muted-foreground/60">
                <Clock className="w-3 h-3" />
                <span className="font-mono">{formatElapsed(elapsed)}</span>
              </span>
            )}
            {totalCost > 0 && (
              <span className="flex items-center gap-1 text-blue-400/60">
                <DollarSign className="w-3 h-3" />
                <span className="font-mono">${totalCost.toFixed(3)}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Pipeline info */}
      <div className="mx-4 mb-2.5 shrink-0">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 bg-secondary/25 rounded-lg px-2.5 py-1.5 border border-border/30">
          <Zap className="w-3 h-3 text-cyan-400/60 shrink-0" />
          <span>
            <span className="text-foreground/60 font-medium">2 LLM calls</span> + deterministic assembly
          </span>
        </div>
      </div>

      {/* Agent cards */}
      <div className="px-4 pb-4 space-y-0 flex-1">
        {AGENT_ORDER.map((name, index) => {
          const nextName = index < AGENT_ORDER.length - 1 ? AGENT_ORDER[index + 1] : null
          const nextAgentActive = nextName
            ? effectiveAgentStates[nextName].status === 'running' || effectiveAgentStates[nextName].status === 'retrying'
            : false

          // Show parallel indicator between architect and frontend
          const isParallelStart = name === 'frontend'

          return (
            <div key={name}>
              {isParallelStart && (
                <div className="flex items-center gap-2 py-1 px-2 -mx-1 mb-0.5">
                  <div className="flex-1 h-px bg-blue-400/20" />
                  <span className="text-[9px] font-medium text-blue-400/70 uppercase tracking-wider">parallel</span>
                  <div className="flex-1 h-px bg-blue-400/20" />
                </div>
              )}
              <div
                ref={(el) => { cardRefs.current[name] = el }}
                style={{ animationDelay: `${index * 60}ms` }}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards"
              >
                <AgentStatusCard
                  agentState={effectiveAgentStates[name]}
                  showConnector={index < AGENT_ORDER.length - 1 && name !== 'frontend'}
                  nextAgentActive={nextAgentActive}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

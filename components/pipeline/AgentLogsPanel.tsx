'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Terminal, Loader2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/lib/store/useProjectStore'

// Colour a log line based on its tag
function lineColor(line: string): string {
  if (line.includes('] ✗') || line.includes('ERROR')) return 'text-red-400'
  if (line.includes('] ✓')) return 'text-green-400'
  if (line.includes('] ▶')) return 'text-yellow-400'
  if (line.includes('] ↺')) return 'text-orange-400'
  if (line.includes('[FILE] +')) return 'text-cyan-400'
  if (line.includes('[FILE] ~')) return 'text-blue-400'
  if (line.includes('[PIPELINE]')) return 'text-purple-400'
  return 'text-foreground/70'
}

// Dim the timestamp prefix and make the rest stand out
function renderLine(line: string, idx: number) {
  // Format: [HH:MM:SS] [AGENT] message
  const match = line.match(/^(\[[^\]]+\])\s(\[[^\]]+\])\s(.*)$/)
  if (match) {
    return (
      <div key={idx} className="flex gap-2 leading-5">
        <span className="shrink-0 text-muted-foreground/50 select-none">{match[1]}</span>
        <span className={cn('shrink-0 font-semibold', lineColor(line))}>{match[2]}</span>
        <span className={cn(lineColor(line))}>{match[3]}</span>
      </div>
    )
  }
  return (
    <div key={idx} className={cn('leading-5', lineColor(line))}>
      {line}
    </div>
  )
}

interface AgentLogsPanelProps {
  projectId: string
}

export function AgentLogsPanel({ projectId: _projectId }: AgentLogsPanelProps) {
  const { liveLogs, isBuilding } = useProjectStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom whenever a new log line arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveLogs.length])

  const handleDownloadLogs = useCallback(() => {
    if (liveLogs.length === 0) return
    const content = liveLogs.join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `build-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [liveLogs])

  if (liveLogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
        <Terminal className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Live Build Logs</p>
        <p className="text-xs text-muted-foreground/60 max-w-xs">
          Real-time agent activity will stream here during a build.
          Start a build to see logs.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50 shrink-0">
        <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Build Output</span>
        {isBuilding && (
          <span className="flex items-center gap-1 text-xs text-yellow-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Running
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/50">{liveLogs.length} lines</span>
        <button
          onClick={handleDownloadLogs}
          title="Download logs"
          className="ml-auto p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="w-3 h-3" />
        </button>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5 bg-background/30">
        {liveLogs.map((line, idx) => renderLine(line, idx))}
        {isBuilding && (
          <div className="flex items-center gap-1 text-muted-foreground/50 mt-1">
            <span className="animate-pulse">▌</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

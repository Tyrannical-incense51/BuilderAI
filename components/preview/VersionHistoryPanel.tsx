'use client'

import { useState, useEffect, useCallback } from 'react'
import { History, Eye, RotateCcw, Loader2, Plus, Minus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatRelativeDate, truncate } from '@/lib/utils'
import type { Project } from '@/lib/store/useProjectStore'

interface VersionSummary {
  id: string
  version_number: number
  prompt: string | null
  file_count: number
  created_at: string
}

interface VersionHistoryPanelProps {
  projectId: string
  currentFiles: Record<string, string>
  onView: (files: Record<string, string>, versionNumber: number) => void
  onRestore: (project: Project) => void
}

export function VersionHistoryPanel({
  projectId,
  currentFiles,
  onView,
  onRestore,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/versions`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.versions) setVersions(data.versions)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  const handleView = useCallback(async (version: VersionSummary) => {
    setViewingId(version.id)
    try {
      const res = await fetch(`/api/projects/${projectId}/versions/${version.id}`)
      if (!res.ok) throw new Error('Failed to load version')
      const { version: full } = await res.json()
      onView(full.files, version.version_number)
    } catch {
      toast.error('Failed to load version')
    } finally {
      setViewingId(null)
    }
  }, [projectId, onView])

  const handleRestore = useCallback(async (version: VersionSummary) => {
    setRestoringId(version.id)
    try {
      const res = await fetch(`/api/projects/${projectId}/versions/${version.id}/restore`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Restore failed')
      const { project } = await res.json()
      onRestore(project)
      toast.success(`Restored to v${version.version_number}`, {
        description: `${version.file_count} files restored`,
      })
    } catch {
      toast.error('Failed to restore version')
    } finally {
      setRestoringId(null)
    }
  }, [projectId, onRestore])

  // Compute simple diff badges between a version and current files
  function computeDiff(versionFileCount: number) {
    const currentCount = Object.keys(currentFiles).length
    const diff = versionFileCount - currentCount
    return diff
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
        <History className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">No build history yet</p>
        <p className="text-xs text-muted-foreground/60 max-w-xs">
          Each successful build creates a snapshot here. Build your project to start tracking versions.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50 shrink-0">
        <History className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Build History</span>
        <span className="text-[10px] text-muted-foreground/50 ml-1">{versions.length} builds</span>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {versions.map((v) => {
          const diff = computeDiff(v.file_count)
          const isViewing = viewingId === v.id
          const isRestoring = restoringId === v.id

          return (
            <div
              key={v.id}
              className="rounded-lg border border-border bg-card/30 p-3 space-y-2 hover:border-border/80 transition-colors"
            >
              {/* Version header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-mono bg-primary/10 text-primary border-0 px-1.5"
                  >
                    v{v.version_number}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeDate(v.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Diff indicator vs current */}
                  {diff > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-400">
                      <Plus className="w-2.5 h-2.5" />
                      {diff}
                    </span>
                  )}
                  {diff < 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-red-400">
                      <Minus className="w-2.5 h-2.5" />
                      {Math.abs(diff)}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground/50">
                    {v.file_count} files
                  </span>
                </div>
              </div>

              {/* Prompt snippet */}
              {v.prompt && (
                <p className="text-xs text-foreground/70 leading-relaxed">
                  {truncate(v.prompt, 100)}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] gap-1 px-2"
                  onClick={() => handleView(v)}
                  disabled={isViewing || isRestoring}
                >
                  {isViewing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] gap-1 px-2 border-border"
                  onClick={() => handleRestore(v)}
                  disabled={isViewing || isRestoring}
                >
                  {isRestoring ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  Restore
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border bg-card/30 shrink-0">
        <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
          <RefreshCw className="w-2.5 h-2.5" />
          Snapshots are created automatically after each successful build
        </p>
      </div>
    </div>
  )
}

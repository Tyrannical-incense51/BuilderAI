'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { MessageSquare, Eye, GitBranch, X, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { PreviewPanel } from '@/components/preview/PreviewPanel'
import { PipelineVisualization } from '@/components/pipeline/PipelineVisualization'
import { CommandPalette } from '@/components/CommandPalette'
import { useProjectStore } from '@/lib/store/useProjectStore'
import { useIsDesktop, useIsMobile } from '@/lib/hooks/useMediaQuery'
import { createClient } from '@/lib/supabase/client'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { Project } from '@/lib/store/useProjectStore'
import type { ChatMessage } from '@/lib/store/useChatStore'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface BuilderInterfaceProps {
  project: Project
  initialMessages: ChatMessage[]
}

type MobileTab = 'chat' | 'preview' | 'pipeline'

export function BuilderInterface({ project, initialMessages }: BuilderInterfaceProps) {
  // Auto-start build if this is a fresh draft with no messages yet
  const autoStartPrompt = (project.status === 'draft' && initialMessages.length === 0)
    ? project.prompt
    : undefined
  const { setCurrentProject, currentProject, resetAgentStates, isBuilding } = useProjectStore()
  const supabase = createClient()

  const isDesktop = useIsDesktop()
  const isMobile = useIsMobile()

  // Mobile: tab-based navigation
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  // Tablet: toggle chat overlay
  const [showChat, setShowChat] = useState(false)
  // Desktop: collapsible panels
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [pipelineCollapsed, setPipelineCollapsed] = useState(false)
  // Desktop: resizable panel widths (persisted to localStorage)
  const [chatWidth, setChatWidth] = useState(() => {
    if (typeof window === 'undefined') return 340
    try { return Number(localStorage.getItem('builderai-chat-width')) || 340 } catch { return 340 }
  })
  const [pipelineWidth, setPipelineWidth] = useState(() => {
    if (typeof window === 'undefined') return 280
    try { return Number(localStorage.getItem('builderai-pipeline-width')) || 280 } catch { return 280 }
  })
  const chatDragRef = useRef<{ dragging: boolean; startX: number; startW: number }>({ dragging: false, startX: 0, startW: 340 })
  const pipelineDragRef = useRef<{ dragging: boolean; startX: number; startW: number }>({ dragging: false, startX: 0, startW: 280 })

  useEffect(() => {
    // Only reset agent states if switching to a DIFFERENT project
    const isSameProject = currentProject?.id === project.id
    if (!isSameProject) {
      setCurrentProject(null)
      resetAgentStates()
    }
    setCurrentProject(project)
    // Clean up autoStart flags for OTHER projects (not this one)
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('autoStartFired_') && k !== `autoStartFired_${project.id}`)
      .forEach(k => sessionStorage.removeItem(k))
  }, [project.id]) // Only re-run when project ID changes

  // Supabase realtime for project updates (only when Supabase is configured)
  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel(`project:${project.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${project.id}` },
        (payload) => {
          setCurrentProject(payload.new as Project)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [project.id, supabase, setCurrentProject])

  // Draggable panel resizer — global mouse tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (chatDragRef.current.dragging) {
        const delta = e.clientX - chatDragRef.current.startX
        setChatWidth(Math.min(Math.floor(window.innerWidth * 0.6), Math.max(240, chatDragRef.current.startW + delta)))
      }
      if (pipelineDragRef.current.dragging) {
        const delta = pipelineDragRef.current.startX - e.clientX
        setPipelineWidth(Math.min(480, Math.max(180, pipelineDragRef.current.startW + delta)))
      }
    }
    const onUp = () => {
      if (chatDragRef.current.dragging) {
        // Read latest width from the DOM element to avoid stale closure
        setChatWidth((w) => { try { localStorage.setItem('builderai-chat-width', String(w)) } catch {} return w })
      }
      if (pipelineDragRef.current.dragging) {
        setPipelineWidth((w) => { try { localStorage.setItem('builderai-pipeline-width', String(w)) } catch {} return w })
      }
      chatDragRef.current.dragging = false
      pipelineDragRef.current.dragging = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  async function handleDownload() {
    if (!currentProject?.generated_files) return
    const files = currentProject.generated_files as Record<string, string>
    const zip = new JSZip()
    Object.entries(files).forEach(([path, content]) => {
      zip.file(path, content)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `${(currentProject.name || 'project').toLowerCase().replace(/\s+/g, '-')}.zip`)
  }

  const handleShare = useCallback(async () => {
    if (!currentProject) return
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/share`, { method: 'POST' })
      const data = await res.json()
      if (data.shareUrl) {
        await navigator.clipboard.writeText(data.shareUrl)
        toast.success('Share link copied!', { description: data.shareUrl })
      }
    } catch {
      toast.error('Failed to create share link')
    }
  }, [currentProject])

  async function handleSave() {
    if (!currentProject || !supabase) return
    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentProject.id)
  }

  const user = null // Will be populated from auth context

  // ─── MOBILE LAYOUT ───
  if (isMobile) {
    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <CommandPalette onDownload={currentProject?.status === 'complete' ? handleDownload : undefined} />
        <Navbar
          projectName={currentProject?.name || project.name}
          onSave={handleSave}
          onDownload={currentProject?.status === 'complete' ? handleDownload : undefined}
          onShare={currentProject?.status === 'complete' ? handleShare : undefined}
          user={user}
        />

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chat' && (
            <div className="h-full flex flex-col">
              <ChatPanel projectId={project.id} autoStartPrompt={autoStartPrompt} />
            </div>
          )}
          {mobileTab === 'preview' && (
            <div className="h-full">
              <PreviewPanel projectId={project.id} />
            </div>
          )}
          {mobileTab === 'pipeline' && (
            <div className="h-full overflow-auto">
              <PipelineVisualization />
            </div>
          )}
        </div>

        {/* Mobile tab bar */}
        <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-sm">
          <div className="flex">
            {([
              { key: 'chat', icon: MessageSquare, label: 'Chat' },
              { key: 'preview', icon: Eye, label: 'Preview' },
              { key: 'pipeline', icon: GitBranch, label: 'Pipeline' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setMobileTab(key)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                  mobileTab === key
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── DESKTOP / TABLET LAYOUT ───
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <CommandPalette onDownload={currentProject?.status === 'complete' ? handleDownload : undefined} />
      <Navbar
        projectName={currentProject?.name || project.name}
        onSave={handleSave}
        onDownload={currentProject?.status === 'complete' ? handleDownload : undefined}
        user={user}
      />

      {/* Three-column layout with collapsible panels */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Chat */}
        {isDesktop ? (
          <>
            <div
              className={cn(
                'shrink-0 flex flex-col border-r border-border bg-card/30 overflow-hidden',
                chatCollapsed && 'border-r-0'
              )}
              style={{ width: chatCollapsed ? 0 : chatWidth }}
            >
              {!chatCollapsed && (
                <ChatPanel projectId={project.id} autoStartPrompt={autoStartPrompt} />
              )}
            </div>

            {/* Left splitter */}
            {!chatCollapsed && (
              <div
                className="w-1 shrink-0 cursor-col-resize splitter-handle relative group z-10"
                onMouseDown={(e) => {
                  e.preventDefault()
                  chatDragRef.current = { dragging: true, startX: e.clientX, startW: chatWidth }
                  document.body.style.cursor = 'col-resize'
                  document.body.style.userSelect = 'none'
                }}
              >
                <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="flex flex-col gap-[3px]">
                    <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/60" />
                    <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/60" />
                    <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/60" />
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Tablet: Floating chat toggle */}
            <button
              onClick={() => setShowChat(!showChat)}
              className={cn(
                'fixed bottom-4 left-4 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200',
                showChat
                  ? 'bg-destructive text-white scale-90'
                  : 'bg-primary text-primary-foreground hover:scale-105'
              )}
            >
              {showChat ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
            </button>

            {/* Tablet: Chat overlay */}
            {showChat && (
              <>
                <div
                  className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                  onClick={() => setShowChat(false)}
                />
                <div
                  className="fixed left-0 top-0 bottom-0 z-30 w-80 flex flex-col border-r border-border bg-card shadow-2xl animate-in slide-in-from-left duration-300"
                >
                  <ChatPanel projectId={project.id} autoStartPrompt={autoStartPrompt} />
                </div>
              </>
            )}
          </>
        )}

        {/* Center: Preview/Code (flex-1) — takes maximum available space */}
        <div className="flex-1 min-w-0 flex flex-col relative">
          {/* Panel toggle buttons — floating on top of preview */}
          {isDesktop && (
            <div className="absolute top-2 left-2 z-20 flex gap-1">
              <button
                onClick={() => setChatCollapsed(!chatCollapsed)}
                className="w-7 h-7 rounded-md bg-card/80 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all"
                title={chatCollapsed ? 'Show chat' : 'Hide chat'}
              >
                {chatCollapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
          {isDesktop && (
            <div className="absolute top-2 right-2 z-20 flex gap-1">
              <button
                onClick={() => setPipelineCollapsed(!pipelineCollapsed)}
                className="w-7 h-7 rounded-md bg-card/80 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all"
                title={pipelineCollapsed ? 'Show pipeline' : 'Hide pipeline'}
              >
                {pipelineCollapsed ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
          <PreviewPanel projectId={project.id} />
        </div>

        {/* Right: Pipeline - visible only on desktop */}
        {isDesktop && (
          <>
            {/* Right splitter */}
            {!pipelineCollapsed && (
              <div
                className="w-1 shrink-0 cursor-col-resize splitter-handle relative group z-10"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pipelineDragRef.current = { dragging: true, startX: e.clientX, startW: pipelineWidth }
                  document.body.style.cursor = 'col-resize'
                  document.body.style.userSelect = 'none'
                }}
              >
                <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="flex flex-col gap-[3px]">
                    <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/60" />
                    <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/60" />
                    <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/60" />
                  </div>
                </div>
              </div>
            )}

            <div
              className={cn(
                'shrink-0 border-l border-border bg-card/30 overflow-hidden',
                pipelineCollapsed && 'border-l-0'
              )}
              style={{ width: pipelineCollapsed ? 0 : pipelineWidth }}
            >
              {!pipelineCollapsed && <PipelineVisualization />}
            </div>
          </>
        )}
      </div>

      {/* Build progress bar — shows at bottom during active builds */}
      {isBuilding && (
        <div className="h-0.5 shrink-0 bg-muted overflow-hidden">
          <div className="h-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-500 animate-[pipeline-flow_2s_linear_infinite] w-1/3" />
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { Eye, Code2, FolderOpen, Download, ScrollText, Save, RotateCcw, Wrench, Loader2, Github, Rocket, ExternalLink, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSettingsStore } from '@/lib/store/useSettingsStore'
import { FileExplorer } from './FileExplorer'
import { CodeEditor, detectLanguage } from './CodeEditor'
import { WebContainerPreview } from './WebContainerPreview'
import { AgentLogsPanel } from '@/components/pipeline/AgentLogsPanel'
import { CopyButton } from '@/components/ui/copy-button'
// VersionHistoryPanel removed — History tab deprecated
import { useProjectStore } from '@/lib/store/useProjectStore'
import { toast } from 'sonner'

interface PreviewPanelProps {
  projectId: string
}

export function PreviewPanel({ projectId }: PreviewPanelProps) {
  const {
    currentProject,
    selectedFile,
    setSelectedFile,
    activeTab,
    setActiveTab,
    setCurrentProject,
    newFiles,
    isBuilding,
    editedFiles,
    setEditedFile,
    revertFile,
    clearEditedFiles,
  } = useProjectStore()

  const [isDownloading, setIsDownloading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [liveErrors, setLiveErrors] = useState<string[]>([])
  const [showFixInput, setShowFixInput] = useState(false)
  const [fixInput, setFixInput] = useState('')
  const [fixingFile, setFixingFile] = useState(false)
  // Track whether we've already auto-switched to the files tab — only switch once per build
  const hasAutoSwitchedRef = useRef(false)
  // Ref to the WebContainer writeFile function — available after preview boots
  const wcWriteRef = useRef<((path: string, content: string) => Promise<void>) | null>(null)
  // Snapshot of files from a history "View" mode (null = showing current project)
  const [viewingVersion, setViewingVersion] = useState<{
    files: Record<string, string>
    versionNumber: number
  } | null>(null)

  // Reset the auto-switch guard when a new build starts; clear edits when build completes
  useEffect(() => {
    if (isBuilding) {
      hasAutoSwitchedRef.current = false
      clearEditedFiles()
      setViewingVersion(null)
    }
  }, [isBuilding, clearEditedFiles])

  // Fetch project if store doesn't have this project's files yet
  useEffect(() => {
    const storeFiles = currentProject?.generated_files
    const storeMatchesPage = currentProject?.id === projectId
    if (storeMatchesPage && storeFiles && Object.keys(storeFiles).length > 0) return
    fetch(`/api/projects/${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.project) setCurrentProject(data.project) })
      .catch(() => {})
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const files = (currentProject?.generated_files as Record<string, string>) || {}
  const isDirty = Object.keys(editedFiles).length > 0

  // When viewing a history version, show that version's files; otherwise show current + edits
  const displayFiles = viewingVersion?.files ?? { ...files, ...editedFiles }
  const selectedContent = selectedFile ? (displayFiles[selectedFile] ?? '') : ''
  const selectedLanguage = selectedFile ? detectLanguage(selectedFile) : 'typescript'
  const hasFiles = Object.keys(files).length > 0
  // Files passed to WebContainer always include edits (so new boots pick them up)
  const effectiveFiles = { ...files, ...editedFiles }

  // Auto-switch to Files tab only on the first batch of new files during a build
  useEffect(() => {
    if (isBuilding && newFiles.length > 0 && activeTab === 'preview' && !hasAutoSwitchedRef.current) {
      hasAutoSwitchedRef.current = true
      setActiveTab('files')
    }
  }, [newFiles.length, isBuilding, activeTab, setActiveTab])

  // Keyboard shortcuts: Cmd+S to save edited files
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (isDirty) {
          handleSaveAll()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      deployAbortRef.current = true
    }
  }, [isDirty]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditorChange = useCallback((newContent: string) => {
    if (!selectedFile || viewingVersion) return
    setEditedFile(selectedFile, newContent)
    // Fire-and-forget sync to WebContainer for instant HMR
    wcWriteRef.current?.(selectedFile, newContent).catch(() => {})
  }, [selectedFile, viewingVersion, setEditedFile])

  const handleSaveAll = useCallback(async () => {
    if (!currentProject || !isDirty) return
    setIsSaving(true)
    try {
      const mergedFiles = { ...files, ...editedFiles }
      const res = await fetch(`/api/projects/${currentProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generated_files: mergedFiles }),
      })
      if (!res.ok) throw new Error('Save failed')
      const { project } = await res.json()
      setCurrentProject(project)
      clearEditedFiles()
      toast.success('Changes saved', {
        description: `${Object.keys(editedFiles).length} file${Object.keys(editedFiles).length > 1 ? 's' : ''} saved`,
      })
    } catch {
      toast.error('Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }, [currentProject, isDirty, files, editedFiles, setCurrentProject, clearEditedFiles])

  const handleRevertFile = useCallback(() => {
    if (!selectedFile) return
    revertFile(selectedFile)
    const originalContent = files[selectedFile] ?? ''
    wcWriteRef.current?.(selectedFile, originalContent).catch(() => {})
    toast.success('File reverted', { description: selectedFile })
  }, [selectedFile, revertFile, files])

  const handleFixSelectedFile = useCallback(async (description: string) => {
    if (!selectedFile || fixingFile) return
    const fileContent = effectiveFiles[selectedFile]
    if (!fileContent) return

    const errorContext = liveErrors[0] ?? ''
    const fullErrorMsg = [errorContext, description].filter(Boolean).join('\n')
    if (!fullErrorMsg) return

    // Collect up to 3 related files this file imports, for context
    const importRe = /from ['"]\.\.?\/([\w/.-]+)['"]/g
    const related: Record<string, string> = {}
    let m: RegExpExecArray | null
    while ((m = importRe.exec(fileContent)) !== null && Object.keys(related).length < 3) {
      const bare = m[1]
      for (const ext of ['', '.ts', '.tsx']) {
        const k = bare + ext
        if (effectiveFiles[k]) { related[k] = effectiveFiles[k]; break }
      }
    }

    const { llmMode, apiModel } = useSettingsStore.getState()
    setFixingFile(true)
    setShowFixInput(false)
    try {
      const res = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: selectedFile,
          file_content: fileContent,
          error_message: fullErrorMsg,
          related_files: related,
          llm_mode: llmMode,
          llm_model: llmMode === 'api' ? apiModel : null,
        }),
      })
      const data = await res.json()
      if (data.success && data.fixed_content) {
        setEditedFile(selectedFile, data.fixed_content)
        wcWriteRef.current?.(selectedFile, data.fixed_content).catch(() => {})
        toast.success(`Fixed ${selectedFile.split('/').pop()}`)
      } else {
        toast.error('Fix failed: ' + (data.error ?? 'unknown'))
      }
    } catch {
      toast.error('Fix request failed')
    } finally {
      setFixingFile(false)
      setFixInput('')
    }
  }, [selectedFile, fixingFile, effectiveFiles, liveErrors, setEditedFile])

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/download`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('content-disposition') || ''
      const match = cd.match(/filename="(.+)"/)
      a.download = match?.[1] || 'project.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Download error:', e)
    } finally {
      setIsDownloading(false)
    }
  }, [projectId])

  // GitHub + Deploy state
  const [isPushing, setIsPushing] = useState(false)
  const [pushSuccess, setPushSuccess] = useState<string | null>(null) // repo URL
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployUrl, setDeployUrl] = useState<string | null>(null)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const deployAbortRef = useRef(false)

  const handlePushToGitHub = useCallback(async () => {
    setIsPushing(true)
    setPushSuccess(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/github`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          toast.error('GitHub not connected', { description: 'Connect GitHub in Settings to push repos.' })
        } else {
          toast.error('Push failed', { description: data.error || 'Unknown error' })
        }
        return
      }
      setPushSuccess(data.repoUrl)
      toast.success('Pushed to GitHub!', {
        description: data.repoUrl,
        action: { label: 'Open', onClick: () => window.open(data.repoUrl, '_blank') },
      })
    } catch {
      toast.error('Push failed', { description: 'Network error' })
    } finally {
      setIsPushing(false)
    }
  }, [projectId])

  const handleDeploy = useCallback(async () => {
    setIsDeploying(true)
    setDeployUrl(null)
    setDeploymentId(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/deploy`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Deploy failed', { description: data.error || 'Unknown error' })
        setIsDeploying(false)
        return
      }
      setDeployUrl(data.url)
      setDeploymentId(data.deploymentId)
      toast.success('Deployment started!', { description: 'Building on Vercel...' })

      // Poll for deployment status
      deployAbortRef.current = false
      const pollStatus = async (depId: string) => {
        for (let i = 0; i < 60; i++) { // max 5 minutes
          await new Promise(r => setTimeout(r, 5000))
          if (deployAbortRef.current) return
          try {
            const statusRes = await fetch(`/api/projects/${projectId}/deploy/status?deploymentId=${depId}`)
            const statusData = await statusRes.json()
            if (statusData.state === 'READY') {
              setDeployUrl(statusData.url)
              setIsDeploying(false)
              toast.success('Deployed!', {
                description: statusData.url,
                action: { label: 'Open', onClick: () => window.open(statusData.url, '_blank') },
              })
              return
            }
            if (statusData.state === 'ERROR' || statusData.state === 'CANCELED') {
              setIsDeploying(false)
              toast.error('Deployment failed', { description: `State: ${statusData.state}` })
              return
            }
          } catch {
            // Continue polling
          }
        }
        setIsDeploying(false)
        toast.error('Deployment timed out')
      }

      pollStatus(data.deploymentId)
    } catch {
      toast.error('Deploy failed', { description: 'Network error' })
      setIsDeploying(false)
    }
  }, [projectId])

  const modifiedFiles = Object.keys(editedFiles)

  // ─── Sliding tab indicator ───
  const tabsListRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const container = tabsListRef.current
    if (!container) return
    const activeEl = container.querySelector('[data-state="active"]') as HTMLElement | null
    if (!activeEl) return
    setIndicatorStyle({
      left: activeEl.offsetLeft,
      width: activeEl.offsetWidth,
    })
  }, [activeTab])

  return (
    <div className="flex flex-col h-full border-l border-border">
      {/* Tabs */}
      <div className="flex items-center gap-1 pl-2 pr-2 py-1.5 border-b border-border bg-card/30 overflow-x-auto">
        <Tabs value={activeTab} onValueChange={(v) => {
          setViewingVersion(null)
          setActiveTab(v as 'preview' | 'code' | 'files' | 'logs')
        }} className="shrink-0">
          <TabsList className="bg-secondary h-8 relative" ref={tabsListRef}>
            <TabsTrigger value="preview" className="gap-1 text-xs h-7 px-2 data-[state=active]:bg-transparent data-[state=active]:text-foreground relative z-10">
              <Eye className="w-3 h-3" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-1 text-xs h-7 px-2 data-[state=active]:bg-transparent data-[state=active]:text-foreground relative z-10">
              <Code2 className="w-3 h-3" />
              Code
              {isDirty && !viewingVersion && (
                <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-yellow-400 unsaved-dot shrink-0" />
              )}
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-1 text-xs h-7 px-2 data-[state=active]:bg-transparent data-[state=active]:text-foreground relative z-10">
              <FolderOpen className="w-3 h-3" />
              Files
              {newFiles.length > 0 && (
                <span className="ml-0.5 text-[9px] font-bold bg-cyan-400/20 text-cyan-400 px-1 rounded-full">
                  +{newFiles.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1 text-xs h-7 px-2 data-[state=active]:bg-transparent data-[state=active]:text-foreground relative z-10">
              <ScrollText className="w-3 h-3" />
              Logs
              {isBuilding && (
                <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              )}
            </TabsTrigger>
            {/* Animated sliding indicator */}
            <div
              className="absolute top-1 h-6 rounded-md bg-card shadow-sm transition-all duration-200 ease-out z-0"
              style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
            />
          </TabsList>
        </Tabs>

        {/* Toolbar actions */}
        <div className="flex items-center gap-0.5 ml-auto shrink-0">
          {activeTab === 'code' && !viewingVersion && (
            <>
              {isDirty && selectedFile && editedFiles[selectedFile] && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-muted-foreground"
                  onClick={handleRevertFile}
                >
                  <RotateCcw className="w-3 h-3" />
                  Revert
                </Button>
              )}
              {isDirty && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleSaveAll}
                  disabled={isSaving}
                >
                  <Save className="w-3 h-3" />
                  {isSaving ? 'Saving…' : `Save (${Object.keys(editedFiles).length})`}
                </Button>
              )}
            </>
          )}
          {activeTab === 'code' && selectedFile && selectedContent && !isDirty && (
            <CopyButton text={selectedContent} size="sm" label="Copy File" />
          )}
          {activeTab === 'code' && selectedFile && !viewingVersion && (
            <>
              <button
                onClick={() => {
                  if (liveErrors.length > 0) {
                    handleFixSelectedFile('')
                  } else {
                    setShowFixInput(v => !v)
                  }
                }}
                disabled={fixingFile}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-7"
                title={liveErrors.length > 0 ? 'Auto-fix build error' : 'Fix selected file with AI'}
              >
                {fixingFile ? <Loader2 size={11} className="animate-spin" /> : <Wrench size={11} />}
                {fixingFile ? 'Fixing…' : liveErrors.length > 0 ? 'Fix Error' : 'Fix'}
              </button>
              {showFixInput && liveErrors.length === 0 && (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleFixSelectedFile(fixInput) }}
                  className="flex items-center gap-1"
                >
                  <input
                    autoFocus
                    value={fixInput}
                    onChange={e => setFixInput(e.target.value)}
                    placeholder="Describe the issue…"
                    className="text-xs bg-secondary border border-border rounded px-2 py-1 w-44 h-7 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button type="submit" disabled={!fixInput.trim()}
                    className="text-xs px-2 py-1 h-7 bg-indigo-600 text-white rounded disabled:opacity-50 hover:bg-indigo-700">
                    Fix
                  </button>
                  <button type="button" onClick={() => setShowFixInput(false)}
                    className="text-xs px-1 py-1 h-7 text-muted-foreground hover:text-foreground">
                    ✕
                  </button>
                </form>
              )}
            </>
          )}
          {hasFiles && (
            <>
              {/* Push to GitHub */}
              {pushSuccess ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 px-2 text-green-500"
                  onClick={() => window.open(pushSuccess, '_blank')}
                >
                  <Check className="w-3 h-3" />
                  GitHub
                  <ExternalLink className="w-2.5 h-2.5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 px-2"
                  onClick={handlePushToGitHub}
                  disabled={isPushing}
                >
                  {isPushing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Github className="w-3 h-3" />}
                  {isPushing ? 'Pushing…' : 'GitHub'}
                </Button>
              )}

              {/* Deploy to Vercel */}
              {deployUrl && !isDeploying ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 px-2 text-green-500"
                  onClick={() => window.open(deployUrl, '_blank')}
                >
                  <Check className="w-3 h-3" />
                  Live
                  <ExternalLink className="w-2.5 h-2.5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 px-2"
                  onClick={handleDeploy}
                  disabled={isDeploying}
                >
                  {isDeploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                  {isDeploying ? 'Deploying…' : 'Deploy'}
                </Button>
              )}

              {/* Download */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 px-2"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                <Download className="w-3 h-3" />
                {isDownloading ? 'Zipping…' : 'ZIP'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">

        {/* ── PREVIEW TAB ── */}
        {activeTab === 'preview' && (
          <div className="h-full">
            {hasFiles ? (
              <WebContainerPreview
                files={effectiveFiles}
                projectName={currentProject?.name}
                projectId={projectId}
                onWriteFileReady={(writeFn) => { wcWriteRef.current = writeFn }}
                onRuntimeErrorsChange={setLiveErrors}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="text-6xl mb-4">🎨</div>
                <h3 className="font-semibold text-lg mb-2">Live Preview</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Your app preview will appear here once the agents generate the code
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── CODE TAB ── */}
        {activeTab === 'code' && (
          <div className="h-full flex flex-col">
            {/* Version snapshot banner */}
            {viewingVersion && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-400 shrink-0">
                <Eye className="w-3 h-3 shrink-0" />
                <span>Viewing v{viewingVersion.versionNumber} — read-only snapshot</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] ml-auto text-yellow-400 hover:text-yellow-300 px-2"
                  onClick={() => setViewingVersion(null)}
                >
                  Close
                </Button>
              </div>
            )}
            <div className="flex flex-1 overflow-hidden">
              <div className="w-48 shrink-0 border-r border-border overflow-y-auto">
                <FileExplorer
                  files={displayFiles}
                  selectedFile={selectedFile}
                  onSelectFile={setSelectedFile}
                  modifiedFiles={viewingVersion ? [] : modifiedFiles}
                />
              </div>
              <div className="flex-1">
                {selectedFile ? (
                  <CodeEditor
                    value={selectedContent}
                    language={selectedLanguage}
                    readOnly={!!viewingVersion}
                    onChange={viewingVersion ? undefined : handleEditorChange}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <Code2 className="w-12 h-12 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground text-sm">Select a file to view its code</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── FILES TAB ── */}
        {activeTab === 'files' && (
          <div className="h-full">
            <FileExplorer
              files={files}
              selectedFile={selectedFile}
              onSelectFile={(path) => {
                setSelectedFile(path)
                setActiveTab('code')
              }}
              modifiedFiles={modifiedFiles}
            />
          </div>
        )}

        {/* ── LOGS TAB ── */}
        {activeTab === 'logs' && (
          <div className="h-full">
            <AgentLogsPanel projectId={projectId} />
          </div>
        )}


      </div>
    </div>
  )
}

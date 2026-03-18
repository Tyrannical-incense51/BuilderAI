'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Search, Zap } from 'lucide-react'
import { ProjectCard } from './ProjectCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

interface Project {
  id: string
  name: string
  description?: string
  prompt: string
  status: 'draft' | 'building' | 'complete' | 'failed'
  generated_files?: Record<string, string>
  created_at: string
  updated_at: string
}

interface ProjectGridProps {
  projects: Project[]
}

export function ProjectGrid({ projects: initialProjects }: ProjectGridProps) {
  const router = useRouter()
  const supabase = createClient()
  const [projects, setProjects] = useState(initialProjects)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'complete' | 'building' | 'failed' | 'draft'>('all')
  const [isCreating, setIsCreating] = useState(false)
  const [newPrompt, setNewPrompt] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)

  const filteredProjects = projects.filter(
    (p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.prompt.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      return matchesSearch && matchesStatus
    }
  )

  // Status counts for filter pills
  const statusCounts = {
    all: projects.length,
    complete: projects.filter(p => p.status === 'complete').length,
    building: projects.filter(p => p.status === 'building').length,
    failed: projects.filter(p => p.status === 'failed').length,
    draft: projects.filter(p => p.status === 'draft').length,
  }

  const handleDelete = useCallback(async (id: string) => {
    const project = projects.find((p) => p.id === id)

    if (supabase) {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) {
        toast.error('Failed to delete project', { description: error.message })
        return
      }
    } else {
      // Dev mode: use API route
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    }

    setProjects((prev) => prev.filter((p) => p.id !== id))
    toast.success('Project deleted', {
      description: project?.name ? `"${project.name}" has been removed` : 'Project has been removed',
    })
  }, [supabase, projects])

  const handleDuplicate = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}/duplicate`, { method: 'POST' })
      if (!res.ok) throw new Error('Duplicate failed')
      const { project } = await res.json()
      setProjects((prev) => [project, ...prev])
      toast.success('Project duplicated', {
        description: `"${project.name}" created`,
        action: { label: 'Open', onClick: () => router.push(`/project/${project.id}`) },
      })
    } catch {
      toast.error('Failed to duplicate project')
    }
  }, [router])

  const handleDownload = useCallback(async (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project?.generated_files) {
      toast.error('No files to download', { description: 'This project has no generated files yet' })
      return
    }

    try {
      const zip = new JSZip()
      Object.entries(project.generated_files).forEach(([path, content]) => {
        zip.file(path, content)
      })
      const blob = await zip.generateAsync({ type: 'blob' })
      const fileName = `${project.name.toLowerCase().replace(/\s+/g, '-')}.zip`
      saveAs(blob, fileName)
      toast.success('Download started', { description: `${fileName} is being downloaded` })
    } catch {
      toast.error('Download failed', { description: 'Something went wrong while creating the ZIP file' })
    }
  }, [projects])

  const handleCreateProject = useCallback(async () => {
    if (!newPrompt.trim()) return
    setIsCreating(true)

    // Generate a name from the prompt
    const name = newPrompt
      .split(' ')
      .slice(0, 4)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data, error } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name,
          prompt: newPrompt,
          status: 'draft',
        })
        .select()
        .single()

      setIsCreating(false)
      if (error) {
        toast.error('Failed to create project', { description: error.message })
      } else if (data) {
        toast.success('Project created', { description: `"${name}" — starting build...` })
        router.push(`/project/${data.id}`)
      }
    } else {
      // Dev mode: use API route
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, prompt: newPrompt }),
        })
        const { project } = await res.json()
        setIsCreating(false)
        toast.success('Project created', { description: `"${name}" — starting build...` })
        router.push(`/project/${project.id}`)
      } catch {
        setIsCreating(false)
        toast.error('Failed to create project')
      }
    }
  }, [newPrompt, supabase, router])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <Button
          onClick={() => setShowNewForm(true)}
          className="gap-2 bg-primary hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      {/* Status filter pills */}
      {projects.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'complete', 'building', 'failed', 'draft'] as const).map((status) => {
            const count = statusCounts[status]
            if (status !== 'all' && count === 0) return null
            const isActive = statusFilter === status
            const colors = {
              all: '',
              complete: 'text-emerald-400',
              building: 'text-yellow-400',
              failed: 'text-red-400',
              draft: 'text-muted-foreground',
            }
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${
                  isActive
                    ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                    : 'bg-secondary/50 border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {status === 'all' ? 'All' : status}
                <span className={`ml-1 ${isActive ? '' : colors[status]} opacity-70`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* New project form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Describe your app</span>
            </div>
            <Input
              placeholder='e.g. "Build me a todo app with auth and dark mode"'
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              className="bg-secondary border-border"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                onClick={handleCreateProject}
                disabled={!newPrompt.trim() || isCreating}
                className="bg-primary hover:bg-primary/90"
                size="sm"
              >
                {isCreating ? 'Creating...' : 'Start Building'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowNewForm(false); setNewPrompt('') }}
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {search ? 'No projects found' : 'No projects yet'}
          </h3>
          <p className="text-muted-foreground text-sm mb-4 max-w-sm">
            {search
              ? 'Try a different search term'
              : 'Create your first project by describing your app in plain English'}
          </p>
          {!search && (
            <Button onClick={() => setShowNewForm(true)} className="gap-2 bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4" />
              Create First Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative">
          <AnimatePresence>
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onDuplicate={handleDuplicate}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

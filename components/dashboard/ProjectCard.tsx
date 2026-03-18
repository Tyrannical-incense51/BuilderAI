'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  MoreVertical, Trash2, Download, ExternalLink, Copy,
  Clock, CheckCircle, XCircle, Loader2, FileCode, AlertTriangle
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, formatRelativeDate, truncate } from '@/lib/utils'

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

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
  onDownload: (id: string) => void
  onDuplicate: (id: string) => void
}

const statusConfig = {
  draft: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Draft' },
  building: { icon: Loader2, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Building' },
  complete: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Complete' },
  failed: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Failed' },
}

export function ProjectCard({ project, onDelete, onDownload, onDuplicate }: ProjectCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const status = statusConfig[project.status]
  const StatusIcon = status.icon

  async function handleDelete() {
    setIsDeleting(true)
    await onDelete(project.id)
    setIsDeleting(false)
    setShowDeleteDialog(false)
  }

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative glass-card rounded-xl p-5 flex flex-col gap-3 group transition-all duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileCode className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-semibold truncate">{project.name}</h3>
          </div>
          {/* z-10 ensures dropdown is above the Link overlay */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative z-10 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border">
              <DropdownMenuItem asChild>
                <Link href={`/project/${project.id}`} className="gap-2 cursor-pointer">
                  <ExternalLink className="w-4 h-4" />
                  Open
                </Link>
              </DropdownMenuItem>
              {project.status === 'complete' && (
                <DropdownMenuItem onClick={() => onDownload(project.id)} className="gap-2 cursor-pointer">
                  <Download className="w-4 h-4" />
                  Download ZIP
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onDuplicate(project.id)} className="gap-2 cursor-pointer">
                <Copy className="w-4 h-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="gap-2 text-destructive focus:text-destructive cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Prompt preview (2 lines max) */}
        <p className="text-muted-foreground text-sm leading-relaxed flex-1 line-clamp-2">
          {project.prompt}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn('gap-1 text-xs', status.bg, status.color)}
            >
              <StatusIcon className={cn('w-3 h-3', project.status === 'building' && 'animate-spin')} />
              {status.label}
            </Badge>
            {project.generated_files && Object.keys(project.generated_files).length > 0 && (
              <Badge variant="secondary" className="gap-1 text-xs bg-muted text-muted-foreground">
                <FileCode className="w-3 h-3" />
                {Object.keys(project.generated_files).length} files
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatRelativeDate(project.updated_at)}
          </span>
        </div>

        {/* Open link */}
        <Link
          href={`/project/${project.id}`}
          className="absolute inset-0 rounded-xl"
          aria-label={`Open ${project.name}`}
        />
      </motion.div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete Project
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong className="text-foreground">{project.name}</strong>?
              This will permanently remove the project and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete Project'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

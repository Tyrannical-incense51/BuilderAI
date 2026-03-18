'use client'

import Link from 'next/link'
import { ArrowRight, Clock, CheckCircle, XCircle, Loader2, FileCode } from 'lucide-react'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { cn, formatRelativeDate } from '@/lib/utils'

interface Project {
  id: string
  name: string
  status: 'draft' | 'building' | 'complete' | 'failed'
  updated_at: string
  generated_files?: Record<string, string>
}

interface RecentProjectsProps {
  projects: Project[]
}

const statusConfig = {
  draft: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Draft' },
  building: { icon: Loader2, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Building' },
  complete: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Complete' },
  failed: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Failed' },
}

export function RecentProjects({ projects }: RecentProjectsProps) {
  if (projects.length === 0) return null

  const recentProjects = projects.slice(0, 5)

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Recent Projects</h2>
        <Link
          href="/projects"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          View All
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {recentProjects.map((project, i) => {
          const status = statusConfig[project.status]
          const StatusIcon = status.icon

          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * i }}
              className="shrink-0"
            >
              <Link
                href={`/project/${project.id}`}
                className="block glass-card rounded-xl p-4 w-56 group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <FileCode className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                    {project.name}
                  </h3>
                </div>

                <div className="flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className={cn('gap-1 text-[10px]', status.bg, status.color)}
                  >
                    <StatusIcon className={cn('w-2.5 h-2.5', project.status === 'building' && 'animate-spin')} />
                    {status.label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeDate(project.updated_at)}
                  </span>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import { useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { PromptHero } from './PromptHero'
import { RecentProjects } from './RecentProjects'
import { ShowcaseSection } from './ShowcaseSection'
import { CodeRain } from './CodeRain'

// Lazy-load Pipeline3D — Three.js doesn't work with SSR
const Pipeline3D = dynamic(() => import('./Pipeline3D').then(m => ({ default: m.Pipeline3D })), {
  ssr: false,
  loading: () => (
    <div className="h-[450px] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  ),
})

interface Project {
  id: string
  name: string
  status: 'draft' | 'building' | 'complete' | 'failed'
  updated_at: string
  generated_files?: Record<string, string>
}

interface DashboardHubProps {
  displayName?: string
  projects: Project[]
}

// Stagger animation variants
const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
}

export function DashboardHub({ displayName, projects }: DashboardHubProps) {
  const [prompt, setPrompt] = useState('')
  const promptRef = useRef<HTMLDivElement>(null)

  const handleSelectTemplate = (templatePrompt: string) => {
    setPrompt(templatePrompt)
    promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Aurora background */}
      <div className="gradient-mesh">
        <div className="aurora-blob" />
      </div>

      {/* Code rain behind hero */}
      <div className="absolute inset-0 z-[1]">
        <CodeRain />
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="relative z-10 px-6 py-12 space-y-16"
      >
        {/* Hero heading */}
        <motion.div variants={fadeUp} className="text-center space-y-4 pt-8">
          <p className="text-sm text-muted-foreground">
            {displayName ? `Welcome back, ${displayName}` : 'Welcome to BuilderAI'}
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            What do you want to{' '}
            <span className="gradient-text">build</span>?
          </h1>
        </motion.div>

        {/* Prompt hero */}
        <motion.div variants={fadeUp} ref={promptRef}>
          <PromptHero prompt={prompt} onPromptChange={setPrompt} />
        </motion.div>

        {/* Recent projects (only if has projects) */}
        {projects.length > 0 && (
          <motion.div variants={fadeUp}>
            <RecentProjects projects={projects} />
          </motion.div>
        )}

        {/* Showcase — Built with BuilderAI */}
        <motion.div variants={fadeUp}>
          <ShowcaseSection onSelectTemplate={handleSelectTemplate} />
        </motion.div>

        {/* 3D Pipeline visualization */}
        <motion.div variants={fadeUp} className="pb-12">
          <Pipeline3D />
        </motion.div>
      </motion.div>
    </div>
  )
}

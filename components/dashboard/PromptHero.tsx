'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Sparkles, ChevronDown, Check, Shuffle, Wand2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useSettingsStore, AVAILABLE_MODELS } from '@/lib/store/useSettingsStore'
import { toast } from 'sonner'

const suggestions = [
  'Build a task manager with auth and dark mode',
  'Create a portfolio site with animations',
  'Design a real-time chat application',
  'Make a weather dashboard with API integration',
  'Build an e-commerce store with cart',
  'Create a blog platform with markdown support',
]

const SURPRISE_PROMPTS = [
  'Build a retro pixel art editor with layers, color palette, and export to PNG — with neon-themed dark mode',
  'Create a Pomodoro timer app with ambient sound mixer, session stats, and streak tracker — with minimal zen UI',
  'Build a habit tracker with streaks, weekly heatmap visualization, motivational quotes, and push notification reminders',
  'Create a collaborative whiteboard with drawing tools, sticky notes, shapes, and real-time cursor positions',
  'Build a music mood board where users can create playlists by dragging album art onto a canvas with connections and notes',
  'Create an interactive periodic table with element details, quiz mode, and electron configuration visualizer',
  'Build a personal bookshelf app where users scan book covers, track reading progress, and get AI recommendations',
  'Create a code snippet manager with syntax highlighting, tags, search, and a beautiful Monaco-style editor',
  'Build a virtual garden simulator where you plant seeds, water them, and watch 2D pixel plants grow over time',
  'Create a financial goal tracker with savings jars, progress rings, milestone celebrations, and confetti animations',
  'Build a minimalist journaling app with mood tracking, writing streaks, word clouds, and end-of-month summaries',
  'Create a world clock dashboard with beautiful analog clocks, timezone converter, and meeting time planner',
]

interface PromptHeroProps {
  prompt: string
  onPromptChange: (value: string) => void
}

export function PromptHero({ prompt, onPromptChange }: PromptHeroProps) {
  const router = useRouter()
  const supabase = createClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isCreating, setIsCreating] = useState(false)
  const { llmMode, apiModel, setApiModel } = useSettingsStore()
  const currentModelInfo = AVAILABLE_MODELS.find((m) => m.value === apiModel)
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0)
  const [isShuffling, setIsShuffling] = useState(false)

  // Rotate active suggestion highlight
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSuggestionIdx(prev => (prev + 1) % suggestions.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // Auto-resize textarea when prompt is set externally (e.g. from template selection)
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [prompt])

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isCreating) return

    setIsCreating(true)

    const name = prompt
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
          prompt,
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
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, prompt }),
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
  }, [prompt, isCreating, supabase, router])

  const handleChipClick = (text: string) => {
    onPromptChange(text)
    textareaRef.current?.focus()
  }

  const handleSurpriseMe = () => {
    setIsShuffling(true)
    const randomPrompt = SURPRISE_PROMPTS[Math.floor(Math.random() * SURPRISE_PROMPTS.length)]
    onPromptChange(randomPrompt)
    textareaRef.current?.focus()
    setTimeout(() => setIsShuffling(false), 600)
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onPromptChange(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Prompt input card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="prompt-hero relative"
      >
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleTextareaChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Describe the app you want to build..."
            rows={3}
            disabled={isCreating}
            className="w-full bg-transparent border-0 text-foreground placeholder:text-muted-foreground/60 text-base resize-none focus:outline-none p-4 pb-14"
          />

          {/* Bottom bar */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5" />
              {llmMode === 'api' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                      <span>{currentModelInfo?.label ?? apiModel}</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    {AVAILABLE_MODELS.map((m) => (
                      <DropdownMenuItem
                        key={m.value}
                        onClick={() => setApiModel(m.value)}
                        className="flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="text-sm font-medium">{m.label}</div>
                          <div className="text-xs text-muted-foreground">{m.tier}</div>
                        </div>
                        {apiModel === m.value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span>Powered by Claude Code CLI</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Surprise me button */}
              <Button
                onClick={handleSurpriseMe}
                variant="ghost"
                size="sm"
                disabled={isCreating}
                className="gap-1.5 text-muted-foreground hover:text-primary rounded-lg px-3 h-8"
              >
                <motion.div
                  animate={isShuffling ? { rotate: 360 } : { rotate: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                </motion.div>
                <span className="hidden sm:inline">Surprise me</span>
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!prompt.trim() || isCreating}
                size="sm"
                className="gap-2 bg-primary hover:bg-primary/90 rounded-lg px-4 glow-btn click-bounce"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Build
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Interactive suggestion chips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="flex flex-wrap gap-2 mt-4 justify-center"
      >
        {suggestions.map((text, i) => (
          <motion.button
            key={text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.6 + i * 0.05 }}
            onClick={() => handleChipClick(text)}
            disabled={isCreating}
            className={`suggestion-chip px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 disabled:opacity-50 click-bounce ${
              i === activeSuggestionIdx
                ? 'border-primary/50 text-primary bg-primary/10 shadow-sm shadow-primary/10'
                : 'text-muted-foreground border-border/50 hover:border-primary/40 hover:text-primary hover:bg-primary/5'
            }`}
          >
            {text}
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}

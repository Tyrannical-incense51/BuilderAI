'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import {
  Zap, ArrowRight, Github, Wand2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShowcaseSection } from '@/components/dashboard/ShowcaseSection'
import { CodeRain } from '@/components/dashboard/CodeRain'

// Lazy-load Pipeline3D — Three.js doesn't work with SSR
const Pipeline3D = dynamic(() => import('@/components/dashboard/Pipeline3D').then(m => ({ default: m.Pipeline3D })), {
  ssr: false,
  loading: () => (
    <div className="h-[450px] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  ),
})

const TYPEWRITER_PROMPTS = [
  'Build me a Kanban board with drag and drop...',
  'Create a SaaS dashboard with charts...',
  'Make a blog with markdown and dark mode...',
  'Build an AI chat app with streaming...',
  'Create an e-commerce store with cart...',
]

const SURPRISE_PROMPTS = [
  'Build a retro pixel art editor with layers, color palette, and export to PNG',
  'Create a Pomodoro timer app with ambient sound mixer and session stats',
  'Build a habit tracker with streaks and weekly heatmap visualization',
  'Create a collaborative whiteboard with drawing tools and sticky notes',
  'Build a virtual garden simulator where you plant seeds and watch them grow',
  'Create a world clock dashboard with beautiful analog clocks',
]

const stats = [
  { label: '5 AI Agents' },
  { label: 'Next.js + TypeScript' },
  { label: 'Live Hot-Reload' },
  { label: 'Download Ready' },
]

export default function LandingPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [placeholder, setPlaceholder] = useState(TYPEWRITER_PROMPTS[0])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isShuffling, setIsShuffling] = useState(false)

  // Typewriter effect cycling through prompts
  useEffect(() => {
    let promptIdx = 0
    let charIdx = 0
    let deleting = false
    let timeoutId: ReturnType<typeof setTimeout>

    function tick() {
      const full = TYPEWRITER_PROMPTS[promptIdx]
      if (!deleting) {
        charIdx++
        setPlaceholder(full.slice(0, charIdx))
        if (charIdx === full.length) {
          deleting = true
          timeoutId = setTimeout(tick, 1800)
          return
        }
      } else {
        charIdx--
        setPlaceholder(full.slice(0, charIdx))
        if (charIdx === 0) {
          deleting = false
          promptIdx = (promptIdx + 1) % TYPEWRITER_PROMPTS.length
          timeoutId = setTimeout(tick, 300)
          return
        }
      }
      timeoutId = setTimeout(tick, deleting ? 28 : 45)
    }

    timeoutId = setTimeout(tick, 800)
    return () => clearTimeout(timeoutId)
  }, [])

  function handleSubmit() {
    if (!prompt.trim()) return
    router.push(`/signup?prompt=${encodeURIComponent(prompt.trim())}`)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleSelectTemplate(templatePrompt: string) {
    setPrompt(templatePrompt)
    textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    textareaRef.current?.focus()
  }

  function handleSurpriseMe() {
    setIsShuffling(true)
    const randomPrompt = SURPRISE_PROMPTS[Math.floor(Math.random() * SURPRISE_PROMPTS.length)]
    setPrompt(randomPrompt)
    textareaRef.current?.focus()
    setTimeout(() => setIsShuffling(false), 600)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/50 bg-background/60 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold gradient-text">BuilderAI</span>
            <Badge variant="secondary" className="text-[10px] ml-1 hidden sm:block float-badge">Beta</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-primary hover:bg-primary/90 gap-1.5 glow-btn click-bounce">
                Get Started <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Aurora background */}
      <div className="gradient-mesh fixed inset-0">
        <div className="aurora-blob" />
      </div>

      {/* ── HERO ── */}
      <section className="relative pt-32 pb-16 px-4 text-center overflow-hidden">
        {/* Code rain */}
        <div className="absolute inset-0">
          <CodeRain />
        </div>

        {/* Background glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-primary/15 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative max-w-2xl mx-auto space-y-4"
        >
          <Badge variant="secondary" className="text-xs gap-1.5 px-3 py-1 float-badge">
            <Zap className="w-3 h-3 text-primary" />
            Powered by Claude Opus 4.6 + LangGraph
          </Badge>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            What will you{' '}
            <span className="gradient-text">build?</span>
          </h1>

          <p className="text-base text-muted-foreground max-w-md mx-auto">
            Turn ideas into apps in minutes — powered by a transparent multi-agent AI pipeline.
          </p>

          {/* Prompt input */}
          <div className="relative mt-6">
            <div className="prompt-hero relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={2}
                className="w-full bg-transparent px-5 pt-4 pb-14 text-sm resize-none outline-none placeholder:text-muted-foreground/60 leading-relaxed border-0"
              />
              {/* Build button inside */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Zap className="w-3 h-3 text-primary" />
                  <span className="hidden sm:inline">5 AI agents ready</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSurpriseMe}
                    variant="ghost"
                    size="sm"
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
                    size="sm"
                    disabled={!prompt.trim()}
                    className="gap-1.5 bg-primary hover:bg-primary/90 rounded-xl h-8 px-4 glow-btn click-bounce"
                  >
                    Build <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick-fill chips */}
          <div className="flex flex-wrap gap-2 justify-center pt-1">
            {['a todo app', 'a dashboard', 'an AI chatbot', 'a landing page'].map((chip) => (
              <button
                key={chip}
                onClick={() => setPrompt(`Build me ${chip} with dark mode and modern design`)}
                className="text-xs text-muted-foreground bg-secondary/50 hover:bg-secondary/70 border border-border/50 hover:border-primary/30 px-3 py-1.5 rounded-full transition-all hover:text-foreground click-bounce suggestion-chip"
              >
                {chip}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="relative mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
        >
          {stats.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              {i < stats.length - 1 && <span className="text-border text-xs">·</span>}
            </div>
          ))}
        </motion.div>

      </section>

      {/* ── SHOWCASE ── */}
      <section className="relative py-16 px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <ShowcaseSection onSelectTemplate={handleSelectTemplate} />
        </motion.div>
      </section>

      {/* ── 3D PIPELINE ── */}
      <section className="relative py-16 px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Pipeline3D />
        </motion.div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="relative py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Built for Research & Production</h2>
          </motion.div>
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left p-4 text-muted-foreground font-medium">Feature</th>
                  <th className="p-4 text-muted-foreground font-medium">Others</th>
                  <th className="p-4 font-medium text-primary">BuilderAI</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Agent transparency', 'Black box', 'Full pipeline visible'],
                  ['Architecture', 'Proprietary', 'Open LangGraph'],
                  ['Data ownership', 'Platform-owned', 'Your Supabase DB'],
                  ['Research value', 'None', 'Maps to MAS papers'],
                  ['Retry/reflection loops', 'No', 'QA retry cycles'],
                ].map(([feature, others, ours]) => (
                  <tr key={feature as string} className="border-b border-border/20 last:border-0">
                    <td className="p-4 text-muted-foreground">{feature}</td>
                    <td className="p-4 text-center text-destructive/70">{others}</td>
                    <td className="p-4 text-center text-green-400">{ours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-20 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative max-w-xl mx-auto space-y-5"
        >
          <h2 className="text-3xl sm:text-4xl font-bold">Ready to build?</h2>
          <p className="text-muted-foreground">Start free. No credit card required.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup">
              <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90 h-11 px-8 glow-btn click-bounce">
                Start Building Free <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline" className="gap-2 border-border h-11 px-8 click-bounce glass">
                <Github className="w-4 h-4" /> GitHub
              </Button>
            </a>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative border-t border-border/50 py-6 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-sm">BuilderAI</span>
            <span className="text-muted-foreground text-sm">— Final Year Project</span>
          </div>
          <p className="text-muted-foreground text-xs">
            Built with Claude Opus 4.6 · LangGraph · Next.js · Supabase
          </p>
        </div>
      </footer>
    </div>
  )
}

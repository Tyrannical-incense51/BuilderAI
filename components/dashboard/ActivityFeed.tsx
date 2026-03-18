'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Globe } from 'lucide-react'

const APP_TYPES = [
  'a fitness tracker',
  'a recipe app',
  'an e-commerce store',
  'a portfolio site',
  'a task manager',
  'a chat application',
  'a weather dashboard',
  'a blog platform',
  'a SaaS dashboard',
  'a social media app',
  'a crypto tracker',
  'a booking system',
  'a music player',
  'a note-taking app',
  'a project management tool',
  'a real-time dashboard',
  'a landing page',
  'an AI chatbot',
]

const LOCATIONS = [
  'Mumbai', 'San Francisco', 'London', 'Berlin', 'Tokyo', 'Sydney',
  'Toronto', 'Bangalore', 'Paris', 'New York', 'Seoul', 'Singapore',
  'Dubai', 'Amsterdam', 'Stockholm', 'Austin', 'Lisbon', 'Zurich',
]

const TIME_AGO = [
  'just now', '12s ago', '34s ago', '1m ago', '2m ago', '3m ago', '5m ago',
]

interface FeedItem {
  id: number
  app: string
  location: string
  time: string
}

function generateItem(id: number): FeedItem {
  return {
    id,
    app: APP_TYPES[Math.floor(Math.random() * APP_TYPES.length)],
    location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
    time: TIME_AGO[Math.floor(Math.random() * TIME_AGO.length)],
  }
}

export function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>(() =>
    Array.from({ length: 3 }, (_, i) => generateItem(i))
  )
  const counterRef = useRef(3)
  const [buildCount, setBuildCount] = useState(2847)

  // Add new items periodically
  useEffect(() => {
    const interval = setInterval(() => {
      counterRef.current++
      const newItem = generateItem(counterRef.current)
      newItem.time = 'just now'
      setItems(prev => [newItem, ...prev.slice(0, 2)])
      setBuildCount(c => c + 1)
    }, 4000 + Math.random() * 3000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Build counter */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full glass border border-border/50">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold tabular-nums">
            <CountUp target={buildCount} />
          </span>
          <span className="text-xs text-muted-foreground">apps built</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs text-muted-foreground">Live</span>
      </div>

      {/* Feed */}
      <div className="space-y-1.5">
        <AnimatePresence mode="popLayout">
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="flex items-center justify-center gap-2 text-xs text-muted-foreground"
            >
              <Globe className="w-3 h-3 shrink-0 text-muted-foreground/50" />
              <span>
                Someone in <span className="text-foreground/70 font-medium">{item.location}</span> built{' '}
                <span className="text-primary/80 font-medium">{item.app}</span>
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/50 tabular-nums">{item.time}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Count-Up Number Animation ───
function CountUp({ target }: { target: number }) {
  const [count, setCount] = useState(target)
  const prevTarget = useRef(target)

  useEffect(() => {
    if (target === prevTarget.current) return
    const start = prevTarget.current
    const diff = target - start
    const duration = 600
    const startTime = performance.now()

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(start + diff * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
    prevTarget.current = target
  }, [target])

  return <>{count.toLocaleString()}</>
}

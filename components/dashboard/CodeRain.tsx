'use client'

import { useEffect, useRef } from 'react'

const CODE_SNIPPETS = [
  'const App = () => {',
  'return <div>',
  'useState(false)',
  'useEffect(() => {',
  'className="flex"',
  'export default',
  'async function',
  'await fetch(',
  '<Button onClick',
  'interface Props',
  'const [data, set',
  'import { motion',
  'router.push("/',
  'type User = {',
  'const handleSubmit',
  'bg-primary/10',
  'rounded-xl p-4',
  '<Component />',
  'npm run build',
  'flex items-center',
  'text-foreground',
  'border-border',
  'useCallback(() =>',
  'e.preventDefault()',
  'JSON.stringify(',
  'module.exports',
  '.then(res =>',
  'catch(error)',
  'opacity-0',
  'transition-all',
  'grid grid-cols',
  'space-y-4',
  '<svg viewBox',
  'font-semibold',
  'max-w-6xl mx-auto',
  'hover:scale-105',
]

interface Drop {
  x: number
  y: number
  speed: number
  text: string
  opacity: number
  fontSize: number
}

export function CodeRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dropsRef = useRef<Drop[]>([])
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // Initialize drops
    const initDrops = () => {
      const rect = canvas.getBoundingClientRect()
      const count = Math.floor(rect.width / 60)
      dropsRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height * -1,
        speed: 0.3 + Math.random() * 0.7,
        text: CODE_SNIPPETS[Math.floor(Math.random() * CODE_SNIPPETS.length)],
        opacity: 0.03 + Math.random() * 0.06,
        fontSize: 10 + Math.random() * 3,
      }))
    }
    initDrops()

    const animate = () => {
      const rect = canvas.getBoundingClientRect()
      ctx.clearRect(0, 0, rect.width, rect.height)

      for (const drop of dropsRef.current) {
        ctx.font = `${drop.fontSize}px 'JetBrains Mono', 'Fira Code', monospace`
        ctx.fillStyle = `rgba(79, 70, 229, ${drop.opacity})`
        ctx.fillText(drop.text, drop.x, drop.y)

        drop.y += drop.speed

        if (drop.y > rect.height + 20) {
          drop.y = -30
          drop.x = Math.random() * rect.width
          drop.text = CODE_SNIPPETS[Math.floor(Math.random() * CODE_SNIPPETS.length)]
          drop.opacity = 0.03 + Math.random() * 0.06
        }
      }

      animRef.current = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.8 }}
    />
  )
}

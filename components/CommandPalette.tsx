'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye, Code2, Download, LayoutDashboard, Settings,
  FileText, Search, Command, ArrowRight, ScrollText
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/lib/store/useProjectStore'

interface PaletteItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  group: 'actions' | 'files'
  action: () => void
}

interface CommandPaletteProps {
  onDownload?: () => void
}

export function CommandPalette({ onDownload }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const { setActiveTab, setSelectedFile, currentProject } = useProjectStore()

  const generatedFiles = currentProject?.generated_files as Record<string, string> | undefined
  const fileKeys = generatedFiles ? Object.keys(generatedFiles) : []

  const actions: PaletteItem[] = [
    {
      id: 'preview', label: 'Switch to Preview', icon: Eye, group: 'actions',
      action: () => { setActiveTab('preview'); setOpen(false) },
    },
    {
      id: 'code', label: 'Switch to Code', icon: Code2, group: 'actions',
      action: () => { setActiveTab('code'); setOpen(false) },
    },
    {
      id: 'logs', label: 'Switch to Logs', icon: ScrollText, group: 'actions',
      action: () => { setActiveTab('logs'); setOpen(false) },
    },
    ...(onDownload ? [{
      id: 'download', label: 'Download Project', icon: Download, group: 'actions' as const,
      action: () => { onDownload(); setOpen(false) },
    }] : []),
    {
      id: 'dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, group: 'actions',
      action: () => { router.push('/dashboard'); setOpen(false) },
    },
    {
      id: 'settings', label: 'Go to Settings', icon: Settings, group: 'actions',
      action: () => { router.push('/settings'); setOpen(false) },
    },
  ]

  const fileItems: PaletteItem[] = fileKeys.map((path) => ({
    id: `file:${path}`,
    label: path,
    icon: FileText,
    group: 'files' as const,
    action: () => {
      setSelectedFile(path)
      setActiveTab('code')
      setOpen(false)
    },
  }))

  const allItems = [...actions, ...fileItems]

  const filtered = query.trim()
    ? allItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : allItems

  const groupedActions = filtered.filter((i) => i.group === 'actions')
  const groupedFiles = filtered.filter((i) => i.group === 'files')
  const flat = [...groupedActions, ...groupedFiles]

  // Reset selection when query changes
  useEffect(() => { setSelectedIndex(0) }, [query])

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setOpen((prev) => !prev)
    }
    if (e.key === 'Escape') setOpen(false)
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  function handleItemKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      flat[selectedIndex]?.action()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20vh] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg"
          >
            <div className="mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleItemKeyDown}
                  placeholder="Search actions or files..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto py-2">
                {flat.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No results</p>
                )}

                {groupedActions.length > 0 && (
                  <div>
                    <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Actions
                    </p>
                    {groupedActions.map((item) => {
                      const idx = flat.indexOf(item)
                      return (
                        <PaletteRow
                          key={item.id}
                          item={item}
                          selected={idx === selectedIndex}
                          onHover={() => setSelectedIndex(idx)}
                        />
                      )
                    })}
                  </div>
                )}

                {groupedFiles.length > 0 && (
                  <div>
                    <p className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                      Files
                    </p>
                    {groupedFiles.map((item) => {
                      const idx = flat.indexOf(item)
                      return (
                        <PaletteRow
                          key={item.id}
                          item={item}
                          selected={idx === selectedIndex}
                          onHover={() => setSelectedIndex(idx)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer hint */}
              <div className="border-t border-border px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">↑↓</kbd> navigate</span>
                <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">↵</kbd> select</span>
                <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded">esc</kbd> close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function PaletteRow({
  item, selected, onHover,
}: {
  item: PaletteItem
  selected: boolean
  onHover: () => void
}) {
  const Icon = item.icon
  return (
    <button
      onClick={item.action}
      onMouseEnter={onHover}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left',
        selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {selected && <ArrowRight className="w-3 h-3 shrink-0 text-primary" />}
    </button>
  )
}

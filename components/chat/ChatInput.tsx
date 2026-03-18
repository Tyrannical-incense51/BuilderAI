'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Loader2, X, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AVAILABLE_MODELS } from '@/lib/store/useSettingsStore'
import { cn } from '@/lib/utils'

const MAX_LENGTH = 5000

const PLACEHOLDER_TEXTS = [
  'Build me a SaaS dashboard with analytics...',
  'Create a recipe app with meal planning...',
  'Design a portfolio site with animations...',
  'Make an e-commerce store with cart...',
  'Build a task manager with drag & drop...',
]

interface ChatInputProps {
  onSend: (message: string) => void
  onStop?: () => void
  disabled?: boolean
  isStreaming?: boolean
  placeholder?: string
  selectedModel?: string
  onModelChange?: (model: string) => void
}

export function ChatInput({
  onSend,
  onStop,
  disabled,
  isStreaming,
  placeholder,
  selectedModel,
  onModelChange,
}: ChatInputProps) {
  const currentModelInfo = AVAILABLE_MODELS.find((m) => m.value === selectedModel)
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Typewriter placeholder cycling
  const [typedPlaceholder, setTypedPlaceholder] = useState('')
  const placeholderIdx = useRef(0)
  const charIdx = useRef(0)
  const isDeleting = useRef(false)

  useEffect(() => {
    if (value || placeholder) return
    const tick = () => {
      const current = PLACEHOLDER_TEXTS[placeholderIdx.current]
      if (!isDeleting.current) {
        charIdx.current++
        setTypedPlaceholder(current.slice(0, charIdx.current))
        if (charIdx.current === current.length) {
          isDeleting.current = true
          return 2000
        }
        return 40 + Math.random() * 40
      } else {
        charIdx.current--
        setTypedPlaceholder(current.slice(0, charIdx.current))
        if (charIdx.current === 0) {
          isDeleting.current = false
          placeholderIdx.current = (placeholderIdx.current + 1) % PLACEHOLDER_TEXTS.length
          return 500
        }
        return 25
      }
    }
    let timeout: ReturnType<typeof setTimeout>
    const run = () => {
      const delay = tick()
      timeout = setTimeout(run, delay)
    }
    run()
    return () => clearTimeout(timeout)
  }, [value, placeholder])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    if (newValue.length <= MAX_LENGTH) {
      setValue(newValue)
    }
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }

  const handleClear = () => {
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
  }

  const hasText = value.trim().length > 0

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
      <div className="flex items-end gap-2 bg-secondary rounded-xl border border-border p-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || typedPlaceholder || PLACEHOLDER_TEXTS[0]}
            disabled={disabled && !isStreaming}
            rows={1}
            className={cn(
              'w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60',
              'resize-none focus:outline-none min-h-[36px] max-h-[200px] py-2 px-2',
              'scrollbar-thin focus-glow rounded-lg',
              value && 'pr-7'
            )}
          />
          {value && (
            <button
              onClick={handleClear}
              className="absolute right-1 top-2 w-5 h-5 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition-all hover:scale-110"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
        {isStreaming ? (
          <Button
            onClick={onStop}
            size="icon"
            variant="ghost"
            className="shrink-0 h-9 w-9 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive"
          >
            <Square className="w-4 h-4 fill-current" />
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={!hasText || disabled}
            size="icon"
            className={cn(
              'shrink-0 h-9 w-9 rounded-lg bg-primary hover:bg-primary/90 transition-all',
              hasText && !disabled && 'send-ready'
            )}
          >
            {disabled ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> send{' '}
            <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Shift+Enter</kbd> new line
          </p>
          {selectedModel && onModelChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary border border-transparent hover:border-border">
                  <span className="font-medium">{currentModelInfo?.label ?? selectedModel}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {AVAILABLE_MODELS.map((m) => (
                  <DropdownMenuItem
                    key={m.value}
                    onClick={() => onModelChange(m.value)}
                    className="flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.tier}</div>
                    </div>
                    {selectedModel === m.value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {value.length > 0 && (
          <span className={cn(
            'text-[10px] font-mono',
            value.length > MAX_LENGTH * 0.9 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {value.length}/{MAX_LENGTH}
          </span>
        )}
      </div>
    </div>
  )
}

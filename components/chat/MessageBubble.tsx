'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, User, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopyButton } from '@/components/ui/copy-button'
import { MarkdownRenderer } from './MarkdownRenderer'
import { AgentActionCard } from './AgentActionCard'
import { AGENT_CONFIG } from '@/lib/constants/agents'
import type { ChatMessage } from '@/lib/store/useChatStore'

/** Relative time string: "just now", "2m ago", "1h ago", "yesterday", etc. */
function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

interface MessageBubbleProps {
  message: ChatMessage
  /** Whether the previous message was from the same role (for visual grouping) */
  isGrouped?: boolean
}

export function MessageBubble({ message, isGrouped = false }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAgent = message.role === 'agent'
  const [hovered, setHovered] = useState(false)

  // Agent messages: render rich action card instead of plain bubble
  if (isAgent && message.agent_name) {
    return (
      <div className="flex gap-3 flex-row">
        <AgentActionCard agentName={message.agent_name} message={message} />
      </div>
    )
  }

  const agentInfo = message.agent_name ? AGENT_CONFIG[message.agent_name as keyof typeof AGENT_CONFIG] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'flex gap-3 message-animate group/msg',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isGrouped && 'mt-0.5'
      )}
    >
      {/* Avatar — hidden when grouped to visually cluster messages */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 transition-opacity',
          isUser ? 'bg-primary' : 'bg-accent/20',
          isGrouped && 'opacity-0'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-accent" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser && 'items-end')}>
        {!isUser && !isGrouped && (
          <span className="text-xs font-medium text-muted-foreground">BuilderAI</span>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-white rounded-tr-sm'
              : 'bg-secondary border border-border rounded-tl-sm'
          )}
        >
          {message.isStreaming && !message.content ? (
            <div className="flex gap-1 items-center py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
            </div>
          ) : isUser ? (
            // User messages: plain text
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            // Assistant messages: render markdown
            <MarkdownRenderer content={message.content} />
          )}

          {/* Hover actions */}
          {message.content && !message.isStreaming && (
            <div className={cn(
              'absolute -top-2 flex items-center gap-0.5 transition-opacity duration-150',
              isUser ? '-left-2' : '-right-2',
              hovered ? 'opacity-100' : 'opacity-0'
            )}>
              <CopyButton text={message.content} size="sm" className="bg-card border border-border shadow-md rounded-md" />
            </div>
          )}
        </div>

        {/* Relative timestamp — shown on hover or for non-grouped messages */}
        <span className={cn(
          'text-[10px] text-muted-foreground/50 transition-opacity duration-150',
          isGrouped && !hovered ? 'opacity-0 h-0' : 'opacity-100'
        )}>
          {relativeTime(message.created_at)}
        </span>
      </div>
    </motion.div>
  )
}

import { create } from 'zustand'

export type MessageRole = 'user' | 'assistant' | 'system' | 'agent'

/** Metadata embedded in agent messages — persists reasoning across builds & page reloads */
export interface AgentMessageMetadata {
  status: 'running' | 'complete' | 'failed' | 'retrying'
  phase?: 'thinking' | 'planning' | 'coding' | 'verifying'
  thinkingContent?: string
  planBlock?: string
  verifyBlock?: string
  files?: string[]
  durationMs?: number
  startedAt?: number
  completedAt?: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  retryCount?: number
  log?: string
}

export interface ChatMessage {
  id: string
  project_id?: string
  role: MessageRole
  content: string
  agent_name?: string
  metadata?: Record<string, unknown>
  created_at: string
  isStreaming?: boolean
}

interface ChatStore {
  messages: ChatMessage[]
  isLoading: boolean
  streamingMessageId: string | null
  activeAbortController: AbortController | null  // survives component remounts

  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  appendToMessage: (id: string, content: string) => void
  setIsLoading: (loading: boolean) => void
  setStreamingMessageId: (id: string | null) => void
  setActiveAbortController: (ctrl: AbortController | null) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,
  streamingMessageId: null,
  activeAbortController: null,

  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  appendToMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + content } : m
      ),
    })),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
  setActiveAbortController: (ctrl) => set({ activeAbortController: ctrl }),
  clearMessages: () => set({ messages: [] }),
}))

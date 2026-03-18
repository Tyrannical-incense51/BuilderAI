'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LLMMode = 'cli' | 'api'

export interface LLMSettings {
  llmMode: LLMMode
  apiModel: string
  // API key is NOT stored here — it's read from server env
}

interface SettingsStore extends LLMSettings {
  setLLMMode: (mode: LLMMode) => void
  setApiModel: (model: string) => void
}

export const AVAILABLE_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'Balanced' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', tier: 'Most Capable' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', tier: 'Fastest' },
] as const

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // Defaults
      llmMode: 'cli',
      apiModel: 'claude-sonnet-4-6',

      setLLMMode: (mode) => set({ llmMode: mode }),
      setApiModel: (model) => set({ apiModel: model }),
    }),
    {
      name: 'builderai-settings',
    }
  )
)

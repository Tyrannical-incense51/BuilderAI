/**
 * Central agent configuration — single source of truth.
 * Updated for the simplified pipeline (2 LLM calls + deterministic nodes).
 *
 * Pipeline flow:
 *   architect (LLM) → frontend + backend (LLM, parallel)
 *   → repair → sanitize → configs → ui_components → validate & finalize → END
 *
 * The "integrator" and "packager" names are kept for backward compatibility
 * with existing SSE events (config_generator emits as "integrator",
 * validate_and_finalize emits as "packager").
 */
import { Brain, Code2, Cpu, Settings2, Package, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AgentName } from '@/lib/store/useProjectStore'

export { type AgentName }

export const AGENT_ORDER: AgentName[] = [
  'architect',
  'frontend',
  'backend',
  'integrator',
  'packager',
]

export interface AgentConfig {
  icon: LucideIcon
  label: string
  description: string
  color: string
  bgColor: string
  /** Whether this agent uses LLM (shows cost/tokens) or is deterministic */
  isLLM: boolean
}

export const AGENT_CONFIG: Record<AgentName, AgentConfig> = {
  architect: {
    icon: Brain,
    label: 'Architect',
    description: 'Designing app structure & blueprint',
    color: 'text-violet-400',
    bgColor: 'bg-violet-400/10 border-violet-400/20',
    isLLM: true,
  },
  frontend: {
    icon: Code2,
    label: 'Frontend',
    description: 'Generating React components & pages',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border-blue-400/20',
    isLLM: true,
  },
  backend: {
    icon: Cpu,
    label: 'Backend',
    description: 'Building API routes & database',
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10 border-orange-400/20',
    isLLM: true,
  },
  integrator: {
    icon: Settings2,
    label: 'Assembler',
    description: 'Configs, sanitize & polish',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-400/10 border-cyan-400/20',
    isLLM: false,
  },
  qa: {
    icon: Sparkles,
    label: 'QA',
    description: 'Quality review',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10 border-green-400/20',
    isLLM: false,
  },
  packager: {
    icon: Package,
    label: 'Finalizer',
    description: 'Validate & package for preview',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10 border-emerald-400/20',
    isLLM: false,
  },
}

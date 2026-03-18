import { create } from 'zustand'

export type ProjectStatus = 'draft' | 'building' | 'complete' | 'failed'

export interface GeneratedFile {
  path: string
  content: string
  language: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  description?: string
  prompt: string
  status: ProjectStatus
  blueprint?: Record<string, unknown>
  generated_files?: Record<string, string>
  metadata?: Record<string, unknown>
  is_public?: boolean
  created_at: string
  updated_at: string
}

export type AgentName = 'architect' | 'frontend' | 'backend' | 'integrator' | 'qa' | 'packager'
export type AgentStatus = 'idle' | 'running' | 'complete' | 'failed' | 'retrying'

export type AgentPhase = 'thinking' | 'planning' | 'coding' | 'verifying'

export interface AgentState {
  name: AgentName
  status: AgentStatus
  log?: string
  retryCount: number
  durationMs?: number
  startedAt?: number
  completedAt?: number
  // Analytics (API mode only)
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  // Reasoning phases (chain-of-thought)
  phase?: AgentPhase
  thinkingContent?: string
  planBlock?: string
  verifyBlock?: string
}

export interface AgentLogEntry {
  id: string
  project_id: string
  agent_name: string
  status: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
  duration_ms?: number
  retry_count: number
  created_at: string
}

interface ProjectStore {
  currentProject: Project | null
  projects: Project[]
  agentStates: Record<AgentName, AgentState>
  agentLogs: AgentLogEntry[]
  liveLogs: string[]
  newFiles: string[]
  selectedFile: string | null
  activeTab: 'preview' | 'code' | 'files' | 'logs'
  isBuilding: boolean
  // In-memory editor overlay: path → edited content (overrides generated_files)
  editedFiles: Record<string, string>
  // Per-agent file lists (files created/updated by each agent during current build)
  agentFiles: Record<string, string[]>
  // Persisted log history: projectId → array of previous build logs
  logHistory: Record<string, string[][]>

  setCurrentProject: (project: Project | null) => void
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  removeProject: (id: string) => void
  setAgentState: (name: AgentName, state: Partial<AgentState>) => void
  resetAgentStates: () => void
  setSelectedFile: (path: string | null) => void
  setActiveTab: (tab: 'preview' | 'code' | 'files' | 'logs') => void
  setIsBuilding: (building: boolean) => void
  setAgentLogs: (logs: AgentLogEntry[]) => void
  addAgentLog: (log: AgentLogEntry) => void
  updateAgentLog: (agentName: string, updates: Partial<AgentLogEntry>) => void
  addLiveLog: (line: string) => void
  clearLiveLogs: () => void
  archiveLiveLogs: (projectId: string) => void
  setNewFiles: (files: string[]) => void
  // Per-agent file tracking
  setAgentFiles: (agentName: string, files: string[]) => void
  clearAgentFiles: () => void
  // Editor overlay actions
  setEditedFile: (path: string, content: string) => void
  revertFile: (path: string) => void
  clearEditedFiles: () => void
}

const defaultAgentStates: Record<AgentName, AgentState> = {
  architect: { name: 'architect', status: 'idle', retryCount: 0 },
  frontend: { name: 'frontend', status: 'idle', retryCount: 0 },
  backend: { name: 'backend', status: 'idle', retryCount: 0 },
  integrator: { name: 'integrator', status: 'idle', retryCount: 0 },
  qa: { name: 'qa', status: 'idle', retryCount: 0 },
  packager: { name: 'packager', status: 'idle', retryCount: 0 },
}

export const useProjectStore = create<ProjectStore>()((set, get) => ({
      currentProject: null,
      projects: [],
      agentStates: defaultAgentStates,
      agentLogs: [],
      liveLogs: [],
      newFiles: [],
      selectedFile: null,
      activeTab: 'preview',
      isBuilding: false,
      editedFiles: {},
      agentFiles: {},
      logHistory: (() => {
        if (typeof window === 'undefined') return {}
        try { return JSON.parse(localStorage.getItem('builderai-log-history') || '{}') }
        catch { return {} }
      })(),

      setCurrentProject: (project) => set({ currentProject: project }),
      setProjects: (projects) => set({ projects }),
      addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...updates }
              : state.currentProject,
        })),
      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject: state.currentProject?.id === id ? null : state.currentProject,
        })),
      setAgentState: (name, state) =>
        set((prev) => ({
          agentStates: {
            ...prev.agentStates,
            [name]: { ...prev.agentStates[name], ...state },
          },
        })),
      resetAgentStates: () => set({ agentStates: defaultAgentStates }),
      setSelectedFile: (path) => set({ selectedFile: path }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setIsBuilding: (building) => set({ isBuilding: building }),
      setAgentLogs: (logs) => set({ agentLogs: logs }),
      addAgentLog: (log) => set((state) => ({ agentLogs: [...state.agentLogs, log] })),
      updateAgentLog: (agentName, updates) =>
        set((state) => ({
          agentLogs: state.agentLogs.map((l) =>
            l.agent_name === agentName && l.status === 'running'
              ? { ...l, ...updates }
              : l
          ),
        })),
      addLiveLog: (line) => set((state) => ({ liveLogs: [...state.liveLogs, line] })),
      clearLiveLogs: () => set({ liveLogs: [] }),
      archiveLiveLogs: (projectId) =>
        set((state) => {
          if (state.liveLogs.length === 0) return {}
          const existing = state.logHistory[projectId] || []
          // Keep max 5 previous builds per project
          const updated = [...existing, state.liveLogs].slice(-5)
          const full = { ...state.logHistory, [projectId]: updated }
          try { localStorage.setItem('builderai-log-history', JSON.stringify(full)) } catch {}
          return {
            logHistory: full,
            liveLogs: [],
          }
        }),
      setNewFiles: (files) => set({ newFiles: files }),

      // Per-agent file tracking
      setAgentFiles: (agentName, files) =>
        set((state) => ({
          agentFiles: {
            ...state.agentFiles,
            [agentName]: [...(state.agentFiles[agentName] || []), ...files.filter(f => !(state.agentFiles[agentName] || []).includes(f))],
          },
        })),
      clearAgentFiles: () => set({ agentFiles: {} }),

      // Editor overlay: compares against original to detect no-op edits
      setEditedFile: (path, content) =>
        set((state) => {
          const original = (state.currentProject?.generated_files as Record<string, string> | undefined)?.[path]
          const newEdited = { ...state.editedFiles }
          if (content === original) {
            delete newEdited[path] // no longer dirty — matches original
          } else {
            newEdited[path] = content
          }
          return { editedFiles: newEdited }
        }),

      revertFile: (path) =>
        set((state) => {
          const newEdited = { ...state.editedFiles }
          delete newEdited[path]
          return { editedFiles: newEdited }
        }),

      clearEditedFiles: () => set({ editedFiles: {} }),
}))

'use client'

import { useState, useEffect } from 'react'
import { Terminal, Cloud, Zap, Shield, ChevronDown, Save, Check, Wifi, WifiOff, Loader2, DollarSign, Github, ExternalLink, Trash2, Rocket } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSettingsStore, AVAILABLE_MODELS, type LLMMode } from '@/lib/store/useSettingsStore'
import { toast } from 'sonner'

const COST_ESTIMATES: Record<string, string> = {
  opus: '~$0.30 - $0.80 per build',
  sonnet: '~$0.10 - $0.30 per build',
  haiku: '~$0.02 - $0.05 per build',
}

function getCostEstimate(model: string): string {
  if (model.includes('opus')) return COST_ESTIMATES.opus
  if (model.includes('sonnet')) return COST_ESTIMATES.sonnet
  if (model.includes('haiku')) return COST_ESTIMATES.haiku
  return 'Varies by model'
}

export default function SettingsPage() {
  const { llmMode, apiModel, setLLMMode, setApiModel } = useSettingsStore()

  // Local draft state — only saved on explicit Save
  const [draftMode, setDraftMode] = useState<LLMMode>(llmMode)
  const [draftModel, setDraftModel] = useState(apiModel)
  const [apiKeyStatus, setApiKeyStatus] = useState<'checking' | 'set' | 'missing'>('checking')
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

  const hasChanges = draftMode !== llmMode || draftModel !== apiModel

  // GitHub connection state
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const [githubLoading, setGithubLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  // Vercel connection state
  const [vercelConnected, setVercelConnected] = useState(false)
  const [vercelLoading, setVercelLoading] = useState(true)
  const [vercelToken, setVercelToken] = useState('')
  const [savingVercel, setSavingVercel] = useState(false)

  // Fetch GitHub status
  useEffect(() => {
    fetch('/api/settings/github')
      .then((r) => r.json())
      .then((data) => {
        setGithubConnected(data.connected ?? false)
        setGithubUsername(data.username ?? null)
      })
      .catch(() => {})
      .finally(() => setGithubLoading(false))
  }, [])

  // Fetch Vercel status
  useEffect(() => {
    fetch('/api/settings/vercel')
      .then((r) => r.json())
      .then((data) => setVercelConnected(data.connected ?? false))
      .catch(() => {})
      .finally(() => setVercelLoading(false))
  }, [])

  const handleGithubConnect = async () => {
    const supabase = createClient()
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/callback?next=/settings`,
        scopes: 'repo',
      },
    })
  }

  const handleGithubDisconnect = async () => {
    if (!window.confirm('Disconnect GitHub? You will need to reconnect to push repos.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/settings/github/disconnect', { method: 'POST' })
      setGithubConnected(false)
      setGithubUsername(null)
      toast.success('GitHub disconnected')
    } catch {
      toast.error('Failed to disconnect GitHub')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleVercelSave = async () => {
    if (!vercelToken.trim()) return
    setSavingVercel(true)
    try {
      const res = await fetch('/api/settings/vercel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: vercelToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Failed to save Vercel token', { description: data.error || 'Unknown error' })
        return
      }
      setVercelConnected(true)
      setVercelToken('')
      toast.success('Vercel token saved')
    } catch {
      toast.error('Failed to save Vercel token')
    } finally {
      setSavingVercel(false)
    }
  }

  const handleVercelRemove = async () => {
    if (!window.confirm('Remove Vercel token? You will need to re-enter it to deploy.')) return
    try {
      await fetch('/api/settings/vercel', { method: 'DELETE' })
      setVercelConnected(false)
      toast.success('Vercel token removed')
    } catch {
      toast.error('Failed to remove Vercel token')
    }
  }

  // Check if API key is configured on the agent service
  useEffect(() => {
    fetch('/api/settings/status')
      .then((r) => r.json())
      .then((data) => setApiKeyStatus(data.hasApiKey ? 'set' : 'missing'))
      .catch(() => setApiKeyStatus('missing'))
  }, [])

  const handleSave = () => {
    setLLMMode(draftMode)
    setApiModel(draftModel)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
  }

  const handleTestConnection = async () => {
    setTestState('testing')
    try {
      const res = await fetch('/api/settings/status')
      const data = await res.json()
      if (data.agentServiceHealthy) {
        setTestState('success')
        toast.success('Agent service is healthy', {
          description: `Mode: ${data.llmMode || 'unknown'} | Model: ${data.defaultModel || 'unknown'}`,
        })
      } else {
        setTestState('error')
        toast.error('Agent service is not reachable', {
          description: 'Make sure agent-service is running on port 8000',
        })
      }
    } catch {
      setTestState('error')
      toast.error('Connection failed', {
        description: 'Could not reach agent service',
      })
    }
    setTimeout(() => setTestState('idle'), 3000)
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure how BuilderAI generates your apps</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Test Connection */}
          <button
            onClick={handleTestConnection}
            disabled={testState === 'testing'}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all border ${
              testState === 'success'
                ? 'border-green-500/30 bg-green-500/10 text-green-500'
                : testState === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-500'
                : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {testState === 'testing' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : testState === 'success' ? (
              <Wifi className="w-3 h-3" />
            ) : testState === 'error' ? (
              <WifiOff className="w-3 h-3" />
            ) : (
              <Wifi className="w-3 h-3" />
            )}
            {testState === 'testing' ? 'Testing...' : testState === 'success' ? 'Connected' : testState === 'error' ? 'Failed' : 'Test'}
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!hasChanges && saveState === 'idle'}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              saveState === 'saved'
                ? 'bg-green-600 text-white'
                : hasChanges
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-muted-foreground cursor-not-allowed'
            }`}
          >
            {saveState === 'saved' ? (
              <><Check className="w-4 h-4" /> Saved</>
            ) : (
              <><Save className="w-4 h-4" /> Save{hasChanges ? '' : 'd'}</>
            )}
          </button>
        </div>
      </div>

      {/* Currently active indicator */}
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2 border border-border">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        Currently active: <span className="font-medium text-foreground">{llmMode === 'cli' ? 'Claude Code CLI' : `Anthropic API (${apiModel})`}</span>
      </div>

      {/* LLM Mode Selection */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">LLM Provider</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose how agent calls are routed. These modes are completely isolated — CLI never touches your API key, and API never uses your CLI subscription.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* CLI Mode Card */}
            <button
              onClick={() => setDraftMode('cli')}
              className={`relative p-4 rounded-lg border-2 text-left transition-all ${
                draftMode === 'cli'
                  ? 'border-green-500 bg-green-500/5'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              {draftMode === 'cli' && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500" />
              )}
              <Terminal className="w-6 h-6 mb-2 text-green-500" />
              <div className="font-medium">Claude Code CLI</div>
              <div className="text-xs text-muted-foreground mt-1">
                Uses your subscription
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-green-500">
                <Zap className="w-3 h-3" />
                No extra cost
              </div>
            </button>

            {/* API Mode Card */}
            <button
              onClick={() => setDraftMode('api')}
              className={`relative p-4 rounded-lg border-2 text-left transition-all ${
                draftMode === 'api'
                  ? 'border-blue-500 bg-blue-500/5'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              {draftMode === 'api' && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500" />
              )}
              <Cloud className="w-6 h-6 mb-2 text-blue-500" />
              <div className="font-medium">Anthropic API</div>
              <div className="text-xs text-muted-foreground mt-1">
                Per-token billing
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-500">
                <Shield className="w-3 h-3" />
                Choose model
              </div>
            </button>
          </div>
        </div>

        {/* API Mode Settings */}
        {draftMode === 'api' && (
          <div className="space-y-4 p-4 rounded-lg border border-border bg-card/50">
            <h3 className="font-medium text-sm">API Configuration</h3>

            {/* API Key Status */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">API Key</div>
                <div className="text-xs text-muted-foreground">
                  Set via <code className="px-1 py-0.5 bg-secondary rounded text-xs">ANTHROPIC_API_KEY</code> in agent-service/.env
                </div>
              </div>
              <div className={`text-xs font-medium px-2 py-1 rounded ${
                apiKeyStatus === 'set'
                  ? 'bg-green-500/10 text-green-500'
                  : apiKeyStatus === 'missing'
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-yellow-500/10 text-yellow-500'
              }`}>
                {apiKeyStatus === 'set' ? 'Configured' : apiKeyStatus === 'missing' ? 'Not Set' : 'Checking...'}
              </div>
            </div>

            {/* Model Selection */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Model</label>
              <div className="relative">
                <select
                  value={draftModel}
                  onChange={(e) => setDraftModel(e.target.value)}
                  className="w-full appearance-none bg-secondary border border-border rounded-md px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label} — {m.tier}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {draftModel.includes('opus') && 'Most capable. Best for complex apps. Higher cost.'}
                {draftModel.includes('sonnet') && 'Great balance of speed and quality. Recommended.'}
                {draftModel.includes('haiku') && 'Fastest and cheapest. Good for simple apps.'}
              </p>
            </div>

            {/* Cost estimate */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2 border border-border">
              <DollarSign className="w-3 h-3" />
              Estimated cost: <span className="font-medium text-foreground">{getCostEstimate(draftModel)}</span>
            </div>
          </div>
        )}

        {/* CLI Mode Info */}
        {draftMode === 'cli' && (
          <div className="p-4 rounded-lg border border-border bg-card/50">
            <h3 className="font-medium text-sm mb-2">CLI Mode Info</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>Calls <code className="px-1 py-0.5 bg-secondary rounded">claude -p</code> under the hood</li>
              <li>Uses whatever model is configured in your Claude Code settings</li>
              <li>API key is <strong>never</strong> passed to CLI subprocess</li>
              <li>Slightly slower due to subprocess overhead (~1-2s per call)</li>
            </ul>
          </div>
        )}

        {/* Unsaved changes warning */}
        {hasChanges && (
          <div className="text-xs text-yellow-500 bg-yellow-500/5 px-3 py-2 rounded border border-yellow-500/20">
            You have unsaved changes. Click <strong>Save</strong> to apply.
          </div>
        )}
      </div>

      {/* ─── Integrations ─── */}
      <div className="mt-10 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Integrations</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Connect external services for one-click deploy and push to GitHub
          </p>
        </div>

        {/* GitHub Integration */}
        <div className="p-4 rounded-lg border border-border bg-card/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center">
                <Github className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-medium text-sm">GitHub</div>
                <div className="text-xs text-muted-foreground">Push generated projects to GitHub repos</div>
              </div>
            </div>
            {githubLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : githubConnected ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-md flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {githubUsername ?? 'Connected'}
                </span>
                <button
                  onClick={handleGithubDisconnect}
                  disabled={disconnecting}
                  className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded border border-border hover:border-destructive/30 transition-colors"
                >
                  {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            ) : (
              <button
                onClick={handleGithubConnect}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                Connect GitHub
              </button>
            )}
          </div>
          {githubConnected && (
            <p className="text-[11px] text-muted-foreground/70">
              Token stored securely. You can push projects to GitHub directly from the builder.
            </p>
          )}
        </div>

        {/* Vercel Integration */}
        <div className="p-4 rounded-lg border border-border bg-card/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center border border-border">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-medium text-sm">Vercel</div>
                <div className="text-xs text-muted-foreground">Deploy generated apps to Vercel in one click</div>
              </div>
            </div>
            {vercelLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : vercelConnected ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-md flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Connected
                </span>
                <button
                  onClick={handleVercelRemove}
                  className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded border border-border hover:border-destructive/30 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={vercelToken}
                  onChange={(e) => setVercelToken(e.target.value)}
                  placeholder="Paste Vercel token..."
                  className="text-xs bg-secondary border border-border rounded-md px-2.5 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleVercelSave}
                  disabled={!vercelToken.trim() || savingVercel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {savingVercel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
              </div>
            )}
          </div>
          {!vercelConnected && (
            <p className="text-[11px] text-muted-foreground/70">
              Create a token at{' '}
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                vercel.com/account/tokens <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

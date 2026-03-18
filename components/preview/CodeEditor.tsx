'use client'

import dynamic from 'next/dynamic'
import { useCallback } from 'react'
import { CopyButton } from '@/components/ui/copy-button'

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-muted-foreground text-sm">Loading editor...</div>
    </div>
  )}
)

interface CodeEditorProps {
  value: string
  language?: string
  readOnly?: boolean
  onChange?: (value: string) => void
}

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    tsx: 'typescript',
    ts: 'typescript',
    jsx: 'javascript',
    js: 'javascript',
    css: 'css',
    json: 'json',
    md: 'markdown',
    sql: 'sql',
    py: 'python',
    html: 'html',
    yaml: 'yaml',
    yml: 'yaml',
  }
  return map[ext || ''] || 'plaintext'
}

export { detectLanguage }

export function CodeEditor({ value, language = 'typescript', readOnly = true, onChange }: CodeEditorProps) {
  const handleMount = useCallback((editor: unknown, monaco: unknown) => {
    const m = monaco as { editor: { setTheme: (theme: string) => void } }
    m.editor.setTheme('vs-dark')
  }, [])

  return (
    <div className="relative h-full group">
      <MonacoEditor
        height="100%"
        language={language}
        value={value}
        theme="vs-dark"
        onMount={handleMount}
        onChange={onChange ? (val) => onChange(val || '') : undefined}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          renderLineHighlight: 'all',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          padding: { top: 16, bottom: 16 },
        }}
      />
      {/* Floating copy button */}
      {value && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <CopyButton
            text={value}
            size="sm"
            label="Copy"
            className="bg-card/90 border border-border shadow-lg backdrop-blur-sm rounded-md"
          />
        </div>
      )}
    </div>
  )
}

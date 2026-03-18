'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Zap, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileExplorer } from '@/components/preview/FileExplorer'
import { CodeEditor } from '@/components/preview/CodeEditor'

interface ShareViewerProps {
  id: string
  name: string
  prompt: string
  files: Record<string, string>
  createdAt: string
}

export function ShareViewer({ name, prompt, files, createdAt }: ShareViewerProps) {
  const fileKeys = Object.keys(files)
  const [selectedFile, setSelectedFile] = useState<string | null>(fileKeys[0] ?? null)

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 gap-4 shrink-0 z-10">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm gradient-text">BuilderAI</span>
        </Link>

        <span className="text-border text-lg">/</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{name}</span>
            <Badge variant="secondary" className="text-[10px]">Public</Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate max-w-md">{prompt}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">
            Built {new Date(createdAt).toLocaleDateString()}
          </span>
          <Link href={`/signup?prompt=${encodeURIComponent(prompt)}`}>
            <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90">
              Build your own <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Body — file explorer + code viewer */}
      <div className="flex-1 flex overflow-hidden">
        {/* File tree */}
        <div className="w-56 shrink-0 border-r border-border bg-card/20 overflow-y-auto">
          <FileExplorer
            files={files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />
        </div>

        {/* Code (read-only) */}
        <div className="flex-1 min-w-0">
          {selectedFile ? (
            <CodeEditor
              value={files[selectedFile] ?? ''}
              readOnly
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Select a file to view
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

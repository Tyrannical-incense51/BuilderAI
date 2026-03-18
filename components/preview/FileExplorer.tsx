'use client'

import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, FileCode, Folder, FolderOpen, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/lib/store/useProjectStore'

interface FileExplorerProps {
  files: Record<string, string>
  selectedFile: string | null
  onSelectFile: (path: string) => void
  modifiedFiles?: string[]
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

function buildTree(files: Record<string, string>): TreeNode[] {
  const root: TreeNode[] = []

  const sortedPaths = Object.keys(files).sort()

  for (const filePath of sortedPaths) {
    const parts = filePath.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      let node = current.find((n) => n.name === part)

      if (!node) {
        node = {
          name: part,
          path: filePath,
          isDir: !isLast,
          children: [],
        }
        current.push(node)
      }

      current = node.children
    }
  }

  return root
}

function getFileLanguageIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const icons: Record<string, string> = {
    tsx: '\u269B',
    ts: '\uD83D\uDD37',
    jsx: '\u269B',
    js: '\uD83D\uDFE1',
    css: '\uD83C\uDFA8',
    json: '\uD83D\uDCCB',
    md: '\uD83D\uDCDD',
    sql: '\uD83D\uDDC4\uFE0F',
    py: '\uD83D\uDC0D',
    env: '\uD83D\uDD11',
  }
  return icons[ext || ''] || '\uD83D\uDCC4'
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes

  const lower = query.toLowerCase()
  const result: TreeNode[] = []

  for (const node of nodes) {
    if (node.isDir) {
      const filteredChildren = filterTree(node.children, query)
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren })
      }
    } else {
      if (node.name.toLowerCase().includes(lower)) {
        result.push(node)
      }
    }
  }

  return result
}

interface TreeNodeComponentProps {
  node: TreeNode
  depth: number
  selectedFile: string | null
  onSelectFile: (path: string) => void
  forceOpen?: boolean
  newFiles?: string[]
  modifiedFiles?: string[]
}

function TreeNodeComponent({ node, depth, selectedFile, onSelectFile, forceOpen, newFiles, modifiedFiles }: TreeNodeComponentProps) {
  const [isOpen, setIsOpen] = useState(depth < 2 || !!forceOpen)

  if (node.isDir) {
    const open = isOpen || !!forceOpen
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 w-full hover:bg-secondary rounded px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {open ? (
            <ChevronDown className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0" />
          )}
          {open ? (
            <FolderOpen className="w-3.5 h-3.5 shrink-0 text-yellow-400" />
          ) : (
            <Folder className="w-3.5 h-3.5 shrink-0 text-yellow-400" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children.map((child) => (
          <TreeNodeComponent
            key={child.path + child.name}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            forceOpen={forceOpen}
            newFiles={newFiles}
            modifiedFiles={modifiedFiles}
          />
        ))}
      </div>
    )
  }

  const isNew = newFiles?.includes(node.path)
  const isModified = modifiedFiles?.includes(node.path)

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        'flex items-center gap-1.5 w-full rounded px-2 py-1 text-sm transition-all duration-500 text-left',
        selectedFile === node.path
          ? 'bg-primary/10 text-primary'
          : isNew
          ? 'bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20'
          : isModified
          ? 'text-yellow-300 hover:bg-yellow-400/10'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span className="text-xs">{getFileLanguageIcon(node.name)}</span>
      <span className="truncate">{node.name}</span>
      {isNew && (
        <span className="ml-auto shrink-0 text-[9px] font-bold text-cyan-400 bg-cyan-400/20 px-1 rounded">
          NEW
        </span>
      )}
      {isModified && !isNew && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
      )}
    </button>
  )
}

export function FileExplorer({ files, selectedFile, onSelectFile, modifiedFiles }: FileExplorerProps) {
  const [search, setSearch] = useState('')
  const tree = useMemo(() => buildTree(files), [files])
  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search])
  const fileCount = Object.keys(files).length
  const newFiles = useProjectStore((s) => s.newFiles)

  if (fileCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <FileCode className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No files generated yet</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      {/* Header with count */}
      <div className="px-3 py-2 flex items-center justify-between shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Explorer
        </span>
        <div className="flex items-center gap-1.5">
          {newFiles.length > 0 && (
            <span className="text-[9px] font-bold text-cyan-400 bg-cyan-400/20 px-1.5 py-0.5 rounded-full animate-pulse">
              +{newFiles.length} new
            </span>
          )}
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {fileCount}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-secondary border border-border rounded-md pl-7 pr-7 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full hover:bg-muted flex items-center justify-center"
            >
              <X className="w-2.5 h-2.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {filteredTree.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No files match &ldquo;{search}&rdquo;</p>
        ) : (
          filteredTree.map((node) => (
            <TreeNodeComponent
              key={node.path + node.name}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              forceOpen={!!search}
              newFiles={newFiles}
              modifiedFiles={modifiedFiles}
            />
          ))
        )}
      </div>
    </div>
  )
}

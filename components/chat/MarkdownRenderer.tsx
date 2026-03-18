'use client'

import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { CopyButton } from '@/components/ui/copy-button'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('markdown-content', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks with syntax highlighting
          code({ className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || '')
            const codeString = String(children).replace(/\n$/, '')

            // Check if this is an inline code or block code
            // Block code has a language class or contains newlines
            const isBlock = match || codeString.includes('\n')

            if (isBlock) {
              const language = match?.[1] || 'text'
              return (
                <div className="relative group my-3">
                  {/* Language badge + Copy button */}
                  <div className="flex items-center justify-between px-4 py-1.5 bg-[#1e1e2e] border border-border/50 rounded-t-lg">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      {language}
                    </span>
                    <CopyButton text={codeString} size="sm" />
                  </div>
                  <SyntaxHighlighter
                    style={oneDark}
                    language={language}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderTopLeftRadius: 0,
                      borderTopRightRadius: 0,
                      borderBottomLeftRadius: '0.5rem',
                      borderBottomRightRadius: '0.5rem',
                      fontSize: '12px',
                      lineHeight: '1.6',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderTop: 'none',
                    }}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              )
            }

            // Inline code
            return (
              <code
                className="bg-muted/80 px-1.5 py-0.5 rounded text-xs font-mono text-accent"
                {...props}
              >
                {children}
              </code>
            )
          },

          // Paragraphs
          p({ children }) {
            return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
          },

          // Links
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent/80 underline underline-offset-2 transition-colors"
              >
                {children}
              </a>
            )
          },

          // Lists
          ul({ children }) {
            return <ul className="list-disc list-inside mb-2 space-y-0.5 ml-1">{children}</ul>
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside mb-2 space-y-0.5 ml-1">{children}</ol>
          },
          li({ children }) {
            return <li className="text-sm leading-relaxed">{children}</li>
          },

          // Blockquotes
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-accent/50 pl-3 my-2 text-muted-foreground italic">
                {children}
              </blockquote>
            )
          },

          // Headings
          h1({ children }) {
            return <h1 className="text-lg font-bold mb-2 mt-3">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="text-base font-bold mb-1.5 mt-2">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3>
          },

          // Horizontal rule
          hr() {
            return <hr className="my-3 border-border" />
          },

          // Strong/Bold
          strong({ children }) {
            return <strong className="font-semibold text-foreground">{children}</strong>
          },

          // Tables
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full text-xs border-collapse border border-border rounded-lg">
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th className="border border-border px-3 py-1.5 bg-muted/50 text-left font-semibold">
                {children}
              </th>
            )
          },
          td({ children }) {
            return (
              <td className="border border-border px-3 py-1.5">{children}</td>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

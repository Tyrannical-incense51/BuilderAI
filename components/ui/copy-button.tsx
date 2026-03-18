'use client'

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  text: string
  size?: 'sm' | 'default'
  className?: string
  label?: string
}

export function CopyButton({ text, size = 'default', className, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }, [text])

  return (
    <Button
      variant="ghost"
      size={size === 'sm' ? 'sm' : 'default'}
      onClick={handleCopy}
      className={cn(
        'gap-1.5 text-muted-foreground hover:text-foreground transition-colors',
        size === 'sm' && 'h-6 px-2 text-[10px]',
        className
      )}
    >
      {copied ? (
        <Check className={cn('text-green-400', size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      ) : (
        <Copy className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      )}
      {label && <span>{copied ? 'Copied!' : label}</span>}
    </Button>
  )
}

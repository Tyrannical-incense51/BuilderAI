'use client'

import { TemplateGallery } from '@/components/landing/TemplateGallery'
import type { Template } from '@/components/landing/TemplateGallery'

interface TemplateCardsProps {
  onSelectTemplate: (prompt: string) => void
}

export function TemplateCards({ onSelectTemplate }: TemplateCardsProps) {
  function handleSelect(template: Template) {
    onSelectTemplate(template.prompt)
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-foreground">Start from a template</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Click a template to pre-fill the prompt
        </p>
      </div>
      <TemplateGallery onSelect={handleSelect} />
    </div>
  )
}

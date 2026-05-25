import * as React from 'react'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  className?: string
}

export function SqlEditor({ value, onChange, onSubmit, disabled, className }: SqlEditorProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="-- Write SQL here. Cmd/Ctrl+Enter to run."
      disabled={disabled}
      spellCheck={false}
      className={cn(
        'h-full min-h-48 resize-none rounded-none border-0 bg-neutral-950 font-mono text-sm leading-relaxed focus-visible:ring-0',
        className
      )}
    />
  )
}

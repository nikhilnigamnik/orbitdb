import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-xs text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-subtle)] focus-visible:border-[var(--color-border-strong)] focus-visible:bg-[var(--color-surface-elevated)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500/60 aria-invalid:ring-1 aria-invalid:ring-red-500/20',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

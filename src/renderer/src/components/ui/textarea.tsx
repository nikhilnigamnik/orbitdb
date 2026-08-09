import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full min-w-0 rounded-md border border-border-strong bg-input px-2.5 py-2 text-xs text-text outline-none transition-colors placeholder:text-text-subtle focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger/60 aria-invalid:ring-2 aria-invalid:ring-danger/20',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

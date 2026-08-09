import { cn } from '@renderer/lib/utils'
import * as React from 'react'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-7 w-full min-w-0 rounded-md border border-border-strong bg-input px-2.5 text-xs text-text outline-none transition-colors placeholder:text-text-subtle hover:border-text-muted/35 focus-visible:border-accent-text focus-visible:ring-2 focus-visible:ring-accent-text/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger/60 aria-invalid:ring-2 aria-invalid:ring-danger/20',
        className
      )}
      {...props}
    />
  )
}

export { Input }

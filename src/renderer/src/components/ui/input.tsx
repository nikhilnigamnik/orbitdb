import { cn } from '@renderer/lib/utils'
import * as React from 'react'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-7 w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[13px] text-[var(--color-text)] transition-colors outline-none placeholder:text-[var(--color-text-subtle)] focus-visible:border-[var(--color-border-strong)] focus-visible:bg-[var(--color-surface-elevated)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500/60 aria-invalid:ring-1 aria-invalid:ring-red-500/20',
        className
      )}
      {...props}
    />
  )
}

export { Input }

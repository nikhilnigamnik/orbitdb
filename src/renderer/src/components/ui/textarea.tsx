import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full rounded-lg border border-neutral-800 bg-transparent px-2.5 py-2 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 focus-visible:border-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-500/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-3 aria-invalid:ring-red-500/20',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

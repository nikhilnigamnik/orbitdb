import * as React from 'react'
import { cn } from '@renderer/lib/utils'

import { FIELD_FOCUS } from './focus-ring'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        FIELD_FOCUS,
        'min-h-24 w-full min-w-0 rounded-lg border border-border-strong bg-input px-2.5 py-2 text-xs text-text shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle hover:border-text-subtle/45 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger/60 aria-invalid:ring-[3px] aria-invalid:ring-danger/10',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

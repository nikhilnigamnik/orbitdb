import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Checkbox({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'h-4 w-4 cursor-pointer rounded border border-neutral-700 bg-neutral-900 accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Checkbox }

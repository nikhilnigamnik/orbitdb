'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@renderer/lib/utils'

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[1.15rem] w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs outline-none transition-colors duration-300 ease-in-out',
        'data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-elevated',
        'focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-3 rounded-full bg-white ring-0 transition-transform duration-300 ease-in-out',
          'data-[state=checked]:translate-x-[1.5rem] data-[state=unchecked]:translate-x-[0.15rem]'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

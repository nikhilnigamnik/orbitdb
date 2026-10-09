import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@renderer/lib/utils'

import { FOCUS_RING } from './focus-ring'

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // The padding owns the gap at both ends, so the thumb travels between
        // 0 and its own width and cannot drift flush against either edge.
        'peer inline-flex h-[1.15rem] w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent px-[3px] shadow-xs outline-none transition-colors duration-150 ease-out',
        'data-[state=checked]:bg-accent data-[state=unchecked]:bg-border-control',
        FOCUS_RING,
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // A toggle is a direct manipulation: the thumb should land with the
          // click, not glide after it. 300ms read as lag.
          'pointer-events-none block size-3 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] ring-0 transition-transform duration-150 ease-out',
          'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

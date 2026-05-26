'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@renderer/lib/utils'

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer data-[state=checked]:bg-brand cursor-pointer data-[state=unchecked]:bg-primary/10 focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-secondary inline-flex h-[1.15rem] w-10 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors duration-300 ease-in-out outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'bg-background dark:data-[state=unchecked]:bg-primary dark:data-[state=checked]:bg-secondary pointer-events-none block size-3 rounded-full ring-0 transition-all duration-300 ease-in-out data-[state=checked]:translate-x-[1.5rem] data-[state=unchecked]:translate-x-[0.15rem] data-[state=checked]:scale-100 data-[state=unchecked]:scale-100'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

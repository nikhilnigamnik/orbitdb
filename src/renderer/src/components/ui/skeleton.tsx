import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-md bg-size-[200%_100%] animate-shimmer',
        'bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.10)_50%,rgba(255,255,255,0.04)_80%)]',
        className
      )}
      {...props}
    />
  )
}

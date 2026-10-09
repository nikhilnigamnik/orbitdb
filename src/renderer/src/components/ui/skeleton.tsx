import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-md bg-size-[200%_100%] animate-shimmer',
        'bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_80%)]',
        className
      )}
      {...props}
    />
  )
}

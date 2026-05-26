'use client'

import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@renderer/lib/utils'
import { PropsWithChildren, ReactNode, WheelEventHandler } from 'react'

export type PopoverProps = PropsWithChildren<{
  content: ReactNode | string
  align?: 'center' | 'start' | 'end'
  side?: 'bottom' | 'top' | 'left' | 'right'
  openPopover: boolean
  setOpenPopover: (open: boolean) => void
  popoverContentClassName?: string
  onOpenAutoFocus?: PopoverPrimitive.PopoverContentProps['onOpenAutoFocus']
  collisionBoundary?: Element | Element[]
  sticky?: 'partial' | 'always'
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onWheel?: WheelEventHandler
  sideOffset?: number
}>

export function Popover({
  children,
  content,
  align = 'center',
  side = 'bottom',
  openPopover,
  setOpenPopover,
  popoverContentClassName,
  onOpenAutoFocus,
  collisionBoundary,
  sticky,
  onEscapeKeyDown,
  onWheel,
  sideOffset = 8
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={sideOffset}
          align={align}
          side={side}
          className={cn(
            'animate-slide-up-fade z-50 items-center rounded-lg border border-border bg-surface drop-shadow-xs',
            popoverContentClassName
          )}
          sticky={sticky}
          collisionBoundary={collisionBoundary}
          onOpenAutoFocus={onOpenAutoFocus}
          onEscapeKeyDown={onEscapeKeyDown}
          onWheel={onWheel}
        >
          {content}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

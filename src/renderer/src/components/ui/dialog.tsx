'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { PropsWithChildren, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export type DialogProps = PropsWithChildren<{
  content: ReactNode
  open: boolean
  setOpen: (open: boolean) => void
  className?: string
  onOpenAutoFocus?: DialogPrimitive.DialogContentProps['onOpenAutoFocus']
  onEscapeKeyDown?: (event: KeyboardEvent) => void
}>

function Dialog({
  children,
  content,
  open,
  setOpen,
  className,
  onOpenAutoFocus,
  onEscapeKeyDown
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} data-slot="dialog">
      {children && <DialogPrimitive.Trigger asChild>{children}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="dialog-overlay"
          className="animate-fade-in fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          onOpenAutoFocus={onOpenAutoFocus}
          onEscapeKeyDown={onEscapeKeyDown}
          className={cn(
            'animate-scale-in fixed inset-x-0 top-[14vh] z-50 mx-auto w-[min(600px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl shadow-black/70',
            className
          )}
        >
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>Dialog</DialogPrimitive.Title>
            <DialogPrimitive.Description>Dialog content</DialogPrimitive.Description>
          </VisuallyHidden.Root>
          {content}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { Dialog }

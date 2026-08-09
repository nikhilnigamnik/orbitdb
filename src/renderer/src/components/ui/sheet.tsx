'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { IconX } from '@tabler/icons-react'
import { PropsWithChildren, ReactNode, WheelEventHandler } from 'react'
import { cn } from '@renderer/lib/utils'

export type SheetProps = PropsWithChildren<{
  content: ReactNode | string
  side?: 'top' | 'right' | 'bottom' | 'left'
  openSheet: boolean
  setOpenSheet: (open: boolean) => void
  sheetContentClassName?: string
  floating?: boolean
  onOpenAutoFocus?: SheetPrimitive.DialogContentProps['onOpenAutoFocus']
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onWheel?: WheelEventHandler
  onPointerDownOutside?: SheetPrimitive.DialogContentProps['onPointerDownOutside']
}>

function Sheet({
  children,
  content,
  side = 'right',
  openSheet,
  setOpenSheet,
  sheetContentClassName,
  floating = true,
  onEscapeKeyDown,
  onWheel,
  onPointerDownOutside
}: SheetProps) {
  return (
    <SheetPrimitive.Root open={openSheet} onOpenChange={setOpenSheet} data-slot="sheet">
      {children && <SheetPrimitive.Trigger asChild>{children}</SheetPrimitive.Trigger>}
      <SheetContent
        side={side}
        floating={floating}
        className={sheetContentClassName}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={onEscapeKeyDown}
        onWheel={onWheel}
        onPointerDownOutside={onPointerDownOutside}
      >
        {content}
      </SheetContent>
    </SheetPrimitive.Root>
  )
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/20 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-150 data-[state=open]:duration-200',
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = 'right',
  floating = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  floating?: boolean
}) {
  const floatingStyles = floating
    ? {
        left: 'left-0 top-0 bottom-0 h-[calc(100%-3rem)] w-[88vw] md:w-3/4 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right:
          'right-0 top-0 bottom-0 h-[calc(100%-0.5rem)] w-[88vw] md:w-3/4 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm'
      }
    : {
        left: 'inset-y-0 left-0 h-full w-3/4 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right:
          'inset-y-0 right-0 h-full w-3/4 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm'
      }

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 m-1 flex flex-col rounded-lg border border-border-strong bg-surface shadow-2xl shadow-black/70 transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=open]:duration-200',
          side === 'right' && floatingStyles.right,
          side === 'left' && floatingStyles.left,
          side === 'top' &&
            'inset-x-0 top-0 h-auto border-b border-border data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
          side === 'bottom' &&
            'inset-x-0 bottom-0 h-auto border-t border-border data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          className
        )}
        {...props}
      >
        <VisuallyHidden.Root>
          <SheetPrimitive.Title>Sheet</SheetPrimitive.Title>
          <SheetPrimitive.Description>Sheet content</SheetPrimitive.Description>
        </VisuallyHidden.Root>
        {children}
        <SheetPrimitive.Close
          aria-label="Close"
          className="absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-surface-elevated/60 text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <IconX className="size-3" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

export { Sheet }

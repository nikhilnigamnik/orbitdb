import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { IconX } from '@tabler/icons-react'
import { PropsWithChildren, ReactNode, WheelEventHandler } from 'react'

import { cn } from '@renderer/lib/utils'

import {
  DialogDescription as SheetDescription,
  DialogHeadingScope,
  DialogTitle as SheetTitle,
  useDialogHeading
} from './dialog-heading'

export interface SheetProps extends PropsWithChildren {
  content: ReactNode | string
  side?: 'top' | 'right' | 'bottom' | 'left'
  openSheet: boolean
  setOpenSheet: (open: boolean) => void
  /**
   * What a screen reader announces when the sheet opens, rendered visually
   * hidden. Content that shows its own heading uses `SheetTitle` instead.
   */
  title?: string
  /** Read after the title. Content with a visible one uses `SheetDescription`. */
  description?: string
  sheetContentClassName?: string
  floating?: boolean
  /**
   * Radix moves focus to the first focusable control on open. Call
   * `event.preventDefault()` here to keep it on the trigger instead.
   */
  onOpenAutoFocus?: SheetPrimitive.DialogContentProps['onOpenAutoFocus']
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onWheel?: WheelEventHandler
  onPointerDownOutside?: SheetPrimitive.DialogContentProps['onPointerDownOutside']
}

function Sheet({
  children,
  content,
  side = 'right',
  openSheet,
  setOpenSheet,
  title,
  description,
  sheetContentClassName,
  floating = true,
  onOpenAutoFocus,
  onEscapeKeyDown,
  onWheel,
  onPointerDownOutside
}: SheetProps) {
  const heading = useDialogHeading({ title, description, fallbackTitle: 'Sheet' })
  return (
    <SheetPrimitive.Root open={openSheet} onOpenChange={setOpenSheet} data-slot="sheet">
      {children && <SheetPrimitive.Trigger asChild>{children}</SheetPrimitive.Trigger>}
      <SheetContent
        side={side}
        floating={floating}
        className={sheetContentClassName}
        onOpenAutoFocus={onOpenAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
        onWheel={onWheel}
        onPointerDownOutside={onPointerDownOutside}
        heading={heading.hidden}
        {...heading.contentProps}
      >
        <DialogHeadingScope registry={heading.registry}>{content}</DialogHeadingScope>
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
        'fixed inset-0 z-50 bg-overlay-soft data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-150 data-[state=open]:duration-200',
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
  heading,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  floating?: boolean
  heading: ReactNode
}) {
  const floatingStyles = floating
    ? {
        left: 'left-0 top-0 bottom-0 h-[calc(100%-3rem)] w-[88vw] md:w-3/4 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right:
          'right-0 top-0 bottom-0 h-[calc(100%-0.75rem)] w-[88vw] md:w-3/4 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm'
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
          // `overflow-hidden` is load-bearing, not cosmetic: without it a taller
          // child spills past the rounded edge and the inner `overflow-auto`
          // region never becomes the thing that scrolls.
          'fixed z-50 m-1.5 flex flex-col overflow-hidden rounded-xl bg-surface text-text shadow-dialog transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=open]:duration-200',
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
        {heading}
        {children}
        <SheetPrimitive.Close
          aria-label="Close"
          className="absolute right-2.5 top-2.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <IconX className="size-4" aria-hidden />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

export { Sheet, SheetTitle, SheetDescription }

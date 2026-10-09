import * as DialogPrimitive from '@radix-ui/react-dialog'
import { PropsWithChildren, ReactNode } from 'react'

import { cn } from '@renderer/lib/utils'

import {
  DialogDescription,
  DialogHeadingScope,
  DialogTitle,
  useDialogHeading
} from './dialog-heading'

export interface DialogProps extends PropsWithChildren {
  content: ReactNode
  open: boolean
  setOpen: (open: boolean) => void
  /**
   * What a screen reader announces when the dialog opens, rendered visually
   * hidden. Content that shows its own heading uses `DialogTitle` instead.
   */
  title?: string
  /** Read after the title. Content with a visible one uses `DialogDescription`. */
  description?: string
  /** `alertdialog` for a confirmation that interrupts, so it is announced as one. */
  role?: 'dialog' | 'alertdialog'
  className?: string
  onOpenAutoFocus?: DialogPrimitive.DialogContentProps['onOpenAutoFocus']
  onEscapeKeyDown?: (event: KeyboardEvent) => void
}

function Dialog({
  children,
  content,
  open,
  setOpen,
  title,
  description,
  role = 'dialog',
  className,
  onOpenAutoFocus,
  onEscapeKeyDown
}: DialogProps) {
  const heading = useDialogHeading({ title, description, fallbackTitle: 'Dialog' })
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} data-slot="dialog">
      {children && <DialogPrimitive.Trigger asChild>{children}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="dialog-overlay"
          className="animate-fade-in fixed inset-0 z-40 bg-[rgba(28,40,64,0.18)]"
        />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          role={role}
          onOpenAutoFocus={onOpenAutoFocus}
          onEscapeKeyDown={onEscapeKeyDown}
          {...heading.contentProps}
          className={cn(
            'animate-scale-in fixed inset-x-0 top-[14vh] z-50 mx-auto w-[min(600px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-surface text-text shadow-[0_0_0_1px_rgba(28,40,64,0.06),0_24px_48px_-12px_rgba(28,40,64,0.28)]',
            className
          )}
        >
          {heading.hidden}
          <DialogHeadingScope registry={heading.registry}>{content}</DialogHeadingScope>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { Dialog, DialogTitle, DialogDescription }

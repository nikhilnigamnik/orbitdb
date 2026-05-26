import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { IconX } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'w-[90vw] sm:max-w-md',
  md: 'w-[90vw] sm:max-w-lg',
  lg: 'w-[90vw] sm:max-w-2xl',
  xl: 'w-[92vw] sm:max-w-4xl'
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md'
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:duration-200 data-[state=closed]:duration-150'
          )}
        />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'fixed top-1 right-1 bottom-1 z-50 flex flex-col rounded-xl border border-border bg-surface shadow-2xl shadow-black/40',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
            'data-[state=open]:duration-300 data-[state=closed]:duration-200',
            'ease-out',
            SIZE_CLASSES[size]
          )}
        >
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>
              {typeof title === 'string' ? title : 'Dialog'}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description>
                {typeof description === 'string' ? description : ''}
              </DialogPrimitive.Description>
            )}
          </VisuallyHidden.Root>

          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-text">{title}</h2>
              {description && <p className="mt-1 text-xs text-text-subtle">{description}</p>}
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              aria-label="Close"
            >
              <IconX size={16} />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-auto px-5 py-4">{children}</div>

          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

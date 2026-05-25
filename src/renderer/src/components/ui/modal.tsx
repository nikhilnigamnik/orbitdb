import * as React from 'react'
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
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
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
  React.useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl',
          SIZE_CLASSES[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
            {description && <p className="mt-1 text-xs text-neutral-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

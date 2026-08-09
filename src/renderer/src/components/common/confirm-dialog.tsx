import { IconAlertTriangle } from '@tabler/icons-react'
import { Sheet } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  isLoading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading
}: ConfirmDialogProps) {
  const isDanger = variant === 'danger'
  return (
    <Sheet
      openSheet={isOpen}
      setOpenSheet={(open) => {
        if (!open && !isLoading) onClose()
      }}
      side="right"
      sheetContentClassName="sm:max-w-sm"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <div className="relative flex flex-1 flex-col items-start gap-4 px-6 py-7">
            <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-px')} />
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
                isDanger
                  ? 'bg-danger/12 text-danger ring-danger/25'
                  : 'bg-text-muted/12 text-text-muted ring-text-muted/25'
              )}
            >
              <IconAlertTriangle size={20} stroke={2} />
            </div>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-xs font-semibold leading-tight tracking-tight text-text">
                {title}
              </h2>
              {description && (
                <p className="text-xs leading-relaxed text-text-muted">{description}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-elevated/20 px-4 py-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              className={
                isDanger
                  ? 'bg-danger-fill text-white shadow-[inset_0_-2px_0_0_var(--color-danger-shade),0_1px_3px_0_rgba(0,0,0,0.4)] hover:bg-danger hover:shadow-none active:shadow-none'
                  : ''
              }
              onClick={onConfirm}
              disabled={isLoading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    />
  )
}

import { IconAlertTriangle } from '@tabler/icons-react'
import { Dialog, DialogDescription, DialogTitle } from '@renderer/components/ui/dialog'
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

/** Attio's confirmation: a small centred modal, title and reason, then the two choices. */
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
    <Dialog
      open={isOpen}
      setOpen={(open) => {
        if (!open && !isLoading) onClose()
      }}
      role="alertdialog"
      className="top-[20vh] w-[min(440px,calc(100vw-2rem))]"
      content={
        <div className="flex flex-col">
          <div className="flex items-start gap-3 px-5 pt-5 pb-3">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                isDanger ? 'bg-danger/10 text-danger' : 'bg-surface-elevated text-text-muted'
              )}
            >
              <IconAlertTriangle size={16} aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1 pt-1">
              <DialogTitle className="text-[15px] leading-tight font-semibold text-text">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="text-xs text-text-muted">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isDanger ? 'destructive' : 'default'}
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

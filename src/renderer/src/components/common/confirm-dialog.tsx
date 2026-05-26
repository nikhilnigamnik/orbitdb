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
          <div className="flex flex-1 flex-col items-start gap-3 px-5 py-5 pr-12">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full',
                isDanger ? 'bg-red-500/10 text-red-400' : 'bg-accent/10 text-accent'
              )}
            >
              <IconAlertTriangle size={18} stroke={2} />
            </div>
            <h2 className="text-[14px] font-semibold text-text">{title}</h2>
            {description && (
              <p className="text-[12px] leading-relaxed text-text-muted">{description}</p>
            )}
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
                  ? 'bg-red-500 text-white hover:bg-red-500/90'
                  : 'bg-accent text-white hover:bg-accent/90'
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

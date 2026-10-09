import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  /**
   * An escape from a retry that can only fail again - a filter deep link that
   * breaks on first load has no other way out.
   */
  secondaryAction?: { label: string; onClick: () => void }
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  secondaryAction
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
          <IconAlertTriangle size={16} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text">{title}</span>
            <Chip tone="rose">Error</Chip>
          </div>
          <p className="rounded-lg border border-border bg-surface-sunken px-2.5 py-2 font-mono text-xs break-all text-danger-text">
            {message}
          </p>
        </div>
      </div>
      {(onRetry || secondaryAction) && (
        <div className="flex items-center gap-2 pl-11">
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
          {secondaryAction && (
            <Button size="sm" variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

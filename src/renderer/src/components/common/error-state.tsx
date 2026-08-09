import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-4">
      <div className="flex items-center gap-2 text-danger">
        <IconAlertTriangle size={16} />
        <span className="text-xs font-medium">{title}</span>
        <Chip tone="rose">Error</Chip>
      </div>
      <p className="text-xs text-danger break-all font-mono">{message}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="secondary"
          className="bg-surface-elevated text-text hover:bg-surface-elevated/70"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  )
}

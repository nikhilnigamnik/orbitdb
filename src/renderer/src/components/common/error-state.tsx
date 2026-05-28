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
    <div className="flex flex-col items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
      <div className="flex items-center gap-2 text-red-400">
        <IconAlertTriangle size={16} />
        <span className="text-sm font-medium">{title}</span>
        <Chip tone="rose">Error</Chip>
      </div>
      <p className="text-xs text-red-300/80 break-all font-mono">{message}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="secondary"
          className="bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  )
}

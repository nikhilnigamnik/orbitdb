import { cn } from '@renderer/lib/utils'
import { Spinner } from '@renderer/components/ui/spinner'

interface LoadingStateProps {
  size?: number
  label?: string
  className?: string
}

/**
 * The single full-area loading state for pages and panels. Fills its container
 * and centers the spinner - `h-full` covers block parents, `flex-1` covers flex
 * parents - so loaders look identical everywhere instead of drifting to the top.
 */
export function LoadingState({ size = 20, label, className }: LoadingStateProps) {
  return (
    <div className={cn('flex h-full min-h-0 w-full flex-1 items-center justify-center', className)}>
      <div className="flex flex-col items-center gap-2">
        <Spinner size={size} className="text-text-subtle" />
        {label && <p className="text-xs text-text-subtle">{label}</p>}
      </div>
    </div>
  )
}

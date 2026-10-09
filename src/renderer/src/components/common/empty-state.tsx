import * as React from 'react'
import { cn } from '@renderer/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center px-6 py-10 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-surface-elevated text-text-subtle [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

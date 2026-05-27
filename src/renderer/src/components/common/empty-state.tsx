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
        'flex border rounded-lg bg-surface-elevated/30 border-border flex-1 flex-col items-center justify-center p-10 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-subtle">
          {icon}
        </div>
      )}
      <p className="text-[14px] font-medium text-text">{title}</p>
      {description && <p className="mt-1 max-w-md text-[12.5px] text-text-subtle">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

import * as React from 'react'
import { cn } from '@renderer/lib/utils'

/**
 * The shape every settings group takes: one bordered card, rows divided by a
 * hairline. Grouping is what tells you which controls belong together, so it is
 * a component rather than a class string copied per section.
 */
export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-elevated/20">
      {children}
    </div>
  )
}

interface SettingRowProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** The control. Sits right, and never shrinks below what it needs. */
  children?: React.ReactNode
  /** Puts the control on its own line - for anything wider than a label allows. */
  isStacked?: boolean
}

export function SettingRow({ title, description, children, isStacked }: SettingRowProps) {
  return (
    <div
      className={cn(
        'flex gap-3 p-4',
        isStacked ? 'flex-col' : 'flex-row items-center justify-between'
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium text-text">{title}</span>
        {description && <span className="text-xs text-text-subtle">{description}</span>}
      </div>
      {children && <div className={cn(!isStacked && 'shrink-0')}>{children}</div>}
    </div>
  )
}

/** A quieter strip under the rows, for a note plus the group's one action. */
export function SettingFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface-elevated/20 px-4 py-2.5">
      {children}
    </div>
  )
}

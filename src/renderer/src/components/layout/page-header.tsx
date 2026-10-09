import * as React from 'react'
import { IconChevronRight } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'

export interface BreadcrumbItem {
  label: React.ReactNode
  icon?: React.ReactNode
  onClick?: () => void
}

interface PageHeaderProps {
  /** Rendered left to right with chevrons between; the last item reads as the title. */
  breadcrumbs: BreadcrumbItem[]
  /** Sits directly after the title - a star, a status chip, a count. */
  titleAdornment?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/**
 * The 48px bar at the top of every page, after Attio's: an icon-led breadcrumb
 * on the left, actions on the right, a hairline underneath. It doubles as the
 * window's drag handle on macOS, where the native title bar is hidden; the base
 * stylesheet already marks buttons and inputs no-drag, so actions still click.
 */
export function PageHeader({ breadcrumbs, titleAdornment, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 [-webkit-app-region:drag]',
        className
      )}
    >
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1">
        {breadcrumbs.map((item, i) => {
          const isLast = i === breadcrumbs.length - 1
          const content = (
            <>
              {item.icon && (
                <span
                  className={cn(
                    'flex shrink-0 items-center [&_svg]:size-4',
                    isLast ? 'text-text-muted' : 'text-text-subtle'
                  )}
                >
                  {item.icon}
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </>
          )
          return (
            <React.Fragment key={i}>
              {i > 0 && <IconChevronRight size={14} className="shrink-0 text-text-subtle/70" />}
              {item.onClick && !isLast ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  {content}
                </button>
              ) : (
                <span
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 px-1.5 py-1 text-sm font-medium',
                    isLast ? 'text-text' : 'text-text-muted'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {content}
                </span>
              )}
            </React.Fragment>
          )
        })}
        {titleAdornment && <div className="ml-1 flex shrink-0 items-center">{titleAdornment}</div>}
      </nav>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  )
}

/**
 * The second band under a PageHeader, where Attio puts the view switcher on the
 * left and "View settings" / "Import / Export" on the right.
 */
export function PageToolbar({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-4',
        className
      )}
    >
      {children}
    </div>
  )
}

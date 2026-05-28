import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export interface SlidingTabItem<T extends string = string> {
  id: T
  label: string
  count?: number
  leading?: (isActive: boolean) => React.ReactNode
  activeClassName?: string
  indicatorClassName?: string
}

interface SlidingTabsProps<T extends string = string> {
  tabs: SlidingTabItem<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
}

export function SlidingTabs<T extends string = string>({
  tabs,
  value,
  onChange,
  className
}: SlidingTabsProps<T>) {
  const [style, setStyle] = React.useState({ left: 0, width: 0 })
  const ref = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-id="${value}"]`)
    if (el) setStyle({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, tabs])

  const activeTab = tabs.find((t) => t.id === value)

  return (
    <div
      ref={ref}
      className={cn(
        'relative inline-flex gap-1 rounded-lg border border-border bg-surface p-1',
        className
      )}
    >
      <div
        aria-hidden
        style={style}
        className={cn(
          'pointer-events-none absolute top-1 bottom-1 rounded-md transition-[left,width,background-color] duration-120 ease-out',
          activeTab?.indicatorClassName ?? 'bg-surface-elevated'
        )}
      />
      {tabs.map((tab) => {
        const isActive = tab.id === value
        return (
          <button
            key={tab.id}
            data-id={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative z-10 flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              isActive ? (tab.activeClassName ?? 'text-text') : 'text-text-muted hover:text-text'
            )}
          >
            {tab.leading?.(isActive)}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[10px] tabular-nums',
                  isActive
                    ? 'bg-surface text-text-muted'
                    : 'bg-surface-elevated/60 text-text-subtle'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

import * as React from 'react'
import { cn } from '@renderer/lib/utils'

/**
 * The hovered index lives outside React state, and each item subscribes to
 * whether it alone is active. Hovering then re-renders the two items whose
 * answer changed rather than every row in the list - the sidebar's table tree
 * can hold hundreds.
 */
interface ActiveIndexStore {
  get: () => number | null
  set: (index: number | null) => void
  subscribe: (listener: () => void) => () => void
}

function createActiveIndexStore(): ActiveIndexStore {
  let activeIndex: number | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => activeIndex,
    set: (index) => {
      if (index === activeIndex) return
      activeIndex = index
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

interface SlidingHoverContextValue {
  store: ActiveIndexStore
  activate: (el: HTMLElement, index: number) => void
}

const SlidingHoverContext = React.createContext<SlidingHoverContextValue | null>(null)

function useSlidingHoverContext(): SlidingHoverContextValue {
  const ctx = React.useContext(SlidingHoverContext)
  if (!ctx) throw new Error('SlidingHoverList.Item must be used inside SlidingHoverList')
  return ctx
}

interface SlidingHoverListProps {
  children: React.ReactNode
  className?: string
  highlightClassName?: string
  transition?: string
  as?: 'ul' | 'div'
}

export function SlidingHoverList({
  children,
  className,
  highlightClassName,
  transition = 'top 100ms ease, height 100ms ease, opacity 100ms ease',
  as: As = 'ul'
}: SlidingHoverListProps) {
  const listRef = React.useRef<HTMLElement>(null)
  const [hoverStyle, setHoverStyle] = React.useState<{
    top: number
    height: number
    opacity: number
  }>({ top: 0, height: 0, opacity: 0 })
  const [store] = React.useState(createActiveIndexStore)

  const activate = React.useCallback(
    (el: HTMLElement, index: number) => {
      const container = listRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const itemRect = el.getBoundingClientRect()
      setHoverStyle({
        top: itemRect.top - containerRect.top,
        height: itemRect.height,
        opacity: 1
      })
      store.set(index)
    },
    [store]
  )

  const contextValue = React.useMemo(() => ({ store, activate }), [store, activate])

  function handleMouseLeave() {
    setHoverStyle((prev) => ({ ...prev, opacity: 0 }))
    store.set(null)
  }

  return (
    <SlidingHoverContext.Provider value={contextValue}>
      <As
        ref={listRef as React.Ref<HTMLUListElement & HTMLDivElement>}
        onMouseLeave={handleMouseLeave}
        className={cn('relative flex flex-col', className)}
      >
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-0 right-0 rounded-md bg-surface-elevated',
            highlightClassName
          )}
          style={{
            top: hoverStyle.top,
            height: hoverStyle.height,
            opacity: hoverStyle.opacity,
            transition
          }}
        />
        {children}
      </As>
    </SlidingHoverContext.Provider>
  )
}

interface SlidingHoverListItemProps {
  index: number
  children: React.ReactNode | ((isActive: boolean) => React.ReactNode)
  className?: string
  style?: React.CSSProperties
  as?: 'li' | 'div'
}

function SlidingHoverListItem({
  index,
  children,
  className,
  style,
  as: As = 'li'
}: SlidingHoverListItemProps) {
  const { store, activate } = useSlidingHoverContext()
  const isActive = React.useSyncExternalStore(store.subscribe, () => store.get() === index)
  return (
    <As
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => activate(e.currentTarget, index)}
      className={cn('relative z-10', className)}
      style={style}
    >
      {typeof children === 'function' ? children(isActive) : children}
    </As>
  )
}

SlidingHoverList.Item = SlidingHoverListItem

import * as React from 'react'
import { cn } from '@renderer/lib/utils'

interface SlidingHoverContextValue {
  activeIndex: number | null
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
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)

  const activate = React.useCallback((el: HTMLElement, index: number) => {
    const container = listRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const itemRect = el.getBoundingClientRect()
    setHoverStyle({
      top: itemRect.top - containerRect.top,
      height: itemRect.height,
      opacity: 1
    })
    setActiveIndex(index)
  }, [])

  function handleMouseLeave() {
    setHoverStyle((prev) => ({ ...prev, opacity: 0 }))
    setActiveIndex(null)
  }

  return (
    <SlidingHoverContext.Provider value={{ activeIndex, activate }}>
      <As
        ref={listRef as React.Ref<HTMLUListElement & HTMLDivElement>}
        onMouseLeave={handleMouseLeave}
        className={cn('relative flex flex-col', className)}
      >
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-0 right-0 rounded-md bg-surface-elevated/80',
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
  const { activeIndex, activate } = useSlidingHoverContext()
  const isActive = activeIndex === index
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

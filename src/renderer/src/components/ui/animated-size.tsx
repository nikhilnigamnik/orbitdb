import * as React from 'react'
import { cn } from '@renderer/lib/utils'

interface AnimatedSizeProps {
  children: React.ReactNode
  className?: string
  durationMs?: number
}

export function AnimatedSize({ children, className, durationMs = 250 }: AnimatedSizeProps) {
  const innerRef = React.useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setHeight(rect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      style={height != null ? { height, transitionDuration: `${durationMs}ms` } : undefined}
      className={cn('overflow-hidden transition-[height] ease-out will-change-[height]', className)}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  )
}

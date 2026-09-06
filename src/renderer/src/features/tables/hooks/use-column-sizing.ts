/**
 * Column widths, and the frozen columns whose offsets depend on them.
 *
 * A sticky column needs an explicit `left`, which is the summed width of
 * everything pinned before it - so a frozen column is always explicitly sized,
 * or the offsets drift as auto-sized columns re-measure.
 */

import * as React from 'react'
import { frozenOffsets, frozenWidth } from '../lib/frozen-columns'

interface ColumnSizingOptions {
  /** Restored widths, keyed by column name. */
  savedColumnSizing?: Record<string, number>
  frozenColumns: string[]
  /** Fires when a resize finishes, not per frame - this is persisted. */
  onColumnSizingCommit?: (sizing: Record<string, number>) => void
}

export function useColumnSizing({
  savedColumnSizing,
  frozenColumns,
  onColumnSizingCommit
}: ColumnSizingOptions) {
  // Controlled rather than left to TanStack, because the widths are restored
  // from the saved view and handed back to it when a drag ends.
  const [columnSizing, setColumnSizing] = React.useState<Record<string, number>>(
    savedColumnSizing ?? {}
  )
  React.useEffect(() => {
    setColumnSizing(savedColumnSizing ?? {})
  }, [savedColumnSizing])

  // Read back through a ref rather than the render closure: onMove outlives the
  // render it was created in, and would otherwise commit the widths that existed
  // when the drag started.
  const sizingRef = React.useRef(columnSizing)
  sizingRef.current = columnSizing

  // Columns stay auto-sized until the user drags a header edge; only then is
  // an explicit width pinned. Double-clicking the handle clears it back to auto.
  // The drag is driven manually (not header.getResizeHandler()) because TanStack
  // starts from its 150px default size, which makes auto-sized columns jump.
  const resizedWidth = React.useCallback(
    (columnId: string): number | undefined => columnSizing[columnId],
    [columnSizing]
  )

  const stickyOffsets = React.useMemo(
    () => frozenOffsets(frozenColumns, columnSizing),
    [frozenColumns, columnSizing]
  )
  const isAnyFrozen = frozenColumns.length > 0
  /** A frozen column is always explicitly sized - the offsets depend on it. */
  const stickyStyle = React.useCallback(
    (columnId: string): React.CSSProperties | undefined => {
      const left = stickyOffsets.get(columnId)
      if (left === undefined) return undefined
      const width = frozenWidth(columnId, columnSizing)
      return { left, width, minWidth: width, maxWidth: width }
    },
    [stickyOffsets, columnSizing]
  )
  const [resizingColumn, setResizingColumn] = React.useState<string | null>(null)
  const startResize = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>, columnId: string) => {
      e.preventDefault()
      const th = e.currentTarget.closest('th')
      if (!th) return
      const startWidth = th.getBoundingClientRect().width
      const startX = e.clientX
      setResizingColumn(columnId)
      // The committed value is read off the table rather than tracked here:
      // onMove runs on a stale closure over whatever sizing existed at mousedown.
      let latest: Record<string, number> = sizingRef.current
      const onMove = (ev: MouseEvent): void => {
        const width = Math.min(1200, Math.max(64, startWidth + ev.clientX - startX))
        setColumnSizing((prev) => {
          latest = { ...prev, [columnId]: width }
          return latest
        })
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setResizingColumn(null)
        // Once, at the end. Committing per frame would write to storage on
        // every mousemove of the drag.
        onColumnSizingCommit?.(latest)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [onColumnSizingCommit]
  )
  const resetColumnSize = React.useCallback(
    (columnId: string) => {
      setColumnSizing((prev) => {
        const next = { ...prev }
        delete next[columnId]
        onColumnSizingCommit?.(next)
        return next
      })
    },
    [onColumnSizingCommit]
  )

  return {
    columnSizing,
    setColumnSizing,
    resizedWidth,
    stickyOffsets,
    isAnyFrozen,
    stickyStyle,
    resizingColumn,
    startResize,
    resetColumnSize
  }
}

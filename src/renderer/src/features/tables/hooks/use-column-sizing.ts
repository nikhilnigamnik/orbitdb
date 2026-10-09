/**
 * Column widths, and the frozen columns whose offsets depend on them.
 *
 * A sticky column needs an explicit `left`, which is the summed width of
 * everything pinned before it - so a frozen column is always explicitly sized,
 * or the offsets drift as auto-sized columns re-measure.
 *
 * The widths themselves travel as CSS variables on the table, and each cell's
 * style only names the variable. Dragging a column edge then rewrites one style
 * attribute instead of re-rendering every row on every frame.
 */

import * as React from 'react'
import { frozenOffsets, frozenWidth } from '../lib/frozen-columns'

interface ColumnSizingOptions {
  /** Data column ids in display order. */
  columnIds: string[]
  /** Restored widths, keyed by column name. */
  savedColumnSizing?: Record<string, number>
  frozenColumns: string[]
  /** Fires when a resize finishes, not per frame - this is persisted. */
  onColumnSizingCommit?: (sizing: Record<string, number>) => void
}

const MIN_WIDTH = 64
const MAX_WIDTH = 1200

function widthVar(index: number): string {
  return `--grid-w-${index}`
}

function leftVar(index: number): string {
  return `--grid-l-${index}`
}

export function useColumnSizing({
  columnIds,
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

  // Read back through a ref rather than the render closure: onUp outlives the
  // render it was created in, and would otherwise commit the widths that
  // existed when the drag started.
  const sizingRef = React.useRef(columnSizing)
  sizingRef.current = columnSizing

  const stickyOffsets = React.useMemo(
    () => frozenOffsets(frozenColumns, columnSizing),
    [frozenColumns, columnSizing]
  )
  const isAnyFrozen = frozenColumns.length > 0

  /** The values, on the table element. Changes on every frame of a drag. */
  const widthVars = React.useMemo(() => {
    const vars: Record<string, string> = {}
    columnIds.forEach((id, index) => {
      const left = stickyOffsets.get(id)
      if (left !== undefined) {
        vars[widthVar(index)] = `${frozenWidth(id, columnSizing)}px`
        vars[leftVar(index)] = `${left}px`
      } else if (columnSizing[id] !== undefined) {
        vars[widthVar(index)] = `${columnSizing[id]}px`
      }
    })
    return vars as React.CSSProperties
  }, [columnIds, columnSizing, stickyOffsets])

  // Which columns carry an explicit width at all. A drag changes the width but
  // not this, so the per-cell styles built from it hold still for the drag.
  const sizedKey = columnIds
    .map((id) => (stickyOffsets.has(id) ? 'f' : columnSizing[id] !== undefined ? 's' : '-'))
    .join('')

  /**
   * Per data column, the style its cells take: absent while auto-sized, the
   * width variables once dragged, plus `left` when frozen.
   */
  const cellStyles = React.useMemo(() => {
    const styles = new Map<string, React.CSSProperties>()
    columnIds.forEach((id, index) => {
      const kind = sizedKey[index]
      if (kind === '-') return
      const width = `var(${widthVar(index)})`
      const style: React.CSSProperties = { width, minWidth: width, maxWidth: width }
      if (kind === 'f') style.left = `var(${leftVar(index)})`
      styles.set(id, style)
    })
    return styles
  }, [columnIds, sizedKey])

  const [resizingColumn, setResizingColumn] = React.useState<string | null>(null)
  // Columns stay auto-sized until the user drags a header edge; only then is
  // an explicit width pinned. Double-clicking the handle clears it back to auto.
  // The drag is driven manually (not header.getResizeHandler()) because TanStack
  // starts from its 150px default size, which makes auto-sized columns jump.
  const startResize = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>, columnId: string) => {
      e.preventDefault()
      const th = e.currentTarget.closest('th')
      if (!th) return
      const startWidth = th.getBoundingClientRect().width
      const startX = e.clientX
      setResizingColumn(columnId)

      let pendingWidth: number | null = null
      let frame = 0
      const apply = (width: number): void =>
        setColumnSizing((prev) =>
          prev[columnId] === width ? prev : { ...prev, [columnId]: width }
        )
      // At most one state update per frame: mousemove fires faster than the
      // screen redraws, and each update re-renders the grid component.
      const onMove = (ev: MouseEvent): void => {
        pendingWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + ev.clientX - startX))
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          if (pendingWidth !== null) apply(pendingWidth)
        })
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        if (frame) cancelAnimationFrame(frame)
        setResizingColumn(null)
        // A click on the handle with no drag changes nothing worth saving.
        if (pendingWidth === null) return
        const committed = { ...sizingRef.current, [columnId]: pendingWidth }
        setColumnSizing(committed)
        // Once, at the end. Committing per frame would write to storage on
        // every mousemove of the drag.
        onColumnSizingCommit?.(committed)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [onColumnSizingCommit]
  )
  const resetColumnSize = React.useCallback(
    (columnId: string) => {
      const next = { ...sizingRef.current }
      delete next[columnId]
      setColumnSizing(next)
      onColumnSizingCommit?.(next)
    },
    [onColumnSizingCommit]
  )

  return {
    columnSizing,
    setColumnSizing,
    isAnyFrozen,
    widthVars,
    cellStyles,
    resizingColumn,
    startResize,
    resetColumnSize
  }
}

import * as React from 'react'
import {
  clampCursor,
  isInRange,
  isSingleCell,
  moveCursor,
  rangeBetween,
  type CellCursor,
  type CellRange,
  type CursorMove
} from '../lib/grid-cursor'
import { toInsertSql, toJsonText, toTsv, type InsertTarget } from '../lib/clipboard-format'

type Row = Record<string, unknown>

export type CopyFormat = 'tsv' | 'json' | 'sql'

interface UseGridCursorOptions {
  rows: Row[]
  /** Data column ids, in display order. Hidden columns are already gone. */
  columnIds: string[]
  /** Opens the inline editor on Enter. Absent when the table cannot be edited. */
  onStartEditing?: (cursor: CellCursor) => void
  /** True while the inline editor owns the keyboard. */
  isEditing: boolean
  /** Identifies the table for `copy as INSERT`. */
  insertTarget: InsertTarget
  onCopied?: (format: CopyFormat, cellCount: number) => void
  onCopyFailed?: (error: unknown) => void
}

const MOVES: Record<string, CursorMove> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'row-start',
  End: 'row-end'
}

/**
 * The grid's keyboard: a cell cursor, a rectangular selection extended with
 * shift, and copy.
 *
 * Separate from the row checkboxes on purpose. Those select whole rows for
 * acting on (delete, export); this selects a region for reading out. Copy
 * prefers the region when there is one.
 */
export function useGridCursor({
  rows,
  columnIds,
  onStartEditing,
  isEditing,
  insertTarget,
  onCopied,
  onCopyFailed
}: UseGridCursorOptions) {
  const [cursor, setCursor] = React.useState<CellCursor | null>(null)
  // Where a shift-extended selection started. Null means the range is just the
  // cursor cell.
  const [anchor, setAnchor] = React.useState<CellCursor | null>(null)

  const bounds = React.useMemo(
    () => ({ rowCount: rows.length, columnCount: columnIds.length }),
    [rows.length, columnIds.length]
  )

  // A reload with fewer rows, or a column hidden, would otherwise leave the
  // cursor pointing past the end of the grid.
  React.useEffect(() => {
    setCursor((prev) => (prev ? clampCursor(prev, bounds) : null))
    setAnchor((prev) => (prev ? clampCursor(prev, bounds) : null))
  }, [bounds])

  const range: CellRange | null = React.useMemo(() => {
    if (!cursor) return null
    return rangeBetween(anchor ?? cursor, cursor)
  }, [anchor, cursor])

  /** `extend` is shift-click: keep the existing corner and move the far one. */
  const selectCell = React.useCallback((rowIndex: number, columnIndex: number, extend = false) => {
    setCursor((prev) => {
      if (extend && prev) setAnchor((current) => current ?? prev)
      else setAnchor(null)
      return { rowIndex, columnIndex }
    })
  }, [])

  const clear = React.useCallback(() => {
    setCursor(null)
    setAnchor(null)
  }, [])

  const isCellInRange = React.useCallback(
    (rowIndex: number, columnIndex: number) =>
      range != null && !isSingleCell(range) && isInRange(range, rowIndex, columnIndex),
    [range]
  )

  const copy = React.useCallback(
    async (format: CopyFormat) => {
      if (!range) return
      const selectedRows = rows.slice(range.rowStart, range.rowEnd + 1)
      const selectedColumns = columnIds.slice(range.colStart, range.colEnd + 1)
      if (selectedRows.length === 0 || selectedColumns.length === 0) return

      const text =
        format === 'json'
          ? toJsonText(selectedRows, selectedColumns)
          : format === 'sql'
            ? toInsertSql(selectedRows, selectedColumns, insertTarget)
            : toTsv(selectedRows, selectedColumns, {
                // A header above a single value is noise; above a block it is
                // what makes the paste readable.
                withHeader: !isSingleCell(range)
              })

      try {
        await navigator.clipboard.writeText(text)
        onCopied?.(format, selectedRows.length * selectedColumns.length)
      } catch (err) {
        onCopyFailed?.(err)
      }
    },
    [range, rows, columnIds, insertTarget, onCopied, onCopyFailed]
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      // The inline editor owns the keyboard while it is open, including Escape.
      if (isEditing) return

      const isMeta = event.metaKey || event.ctrlKey

      if (isMeta && event.key.toLowerCase() === 'c') {
        if (!range) return
        event.preventDefault()
        void copy(event.shiftKey ? 'json' : 'tsv')
        return
      }

      if (event.key === 'Escape') {
        if (!cursor) return
        event.preventDefault()
        clear()
        return
      }

      if (bounds.rowCount === 0 || bounds.columnCount === 0) return

      if (event.key === 'Enter') {
        if (!cursor || !onStartEditing) return
        event.preventDefault()
        onStartEditing(cursor)
        return
      }

      const move = MOVES[event.key]
      if (!move) return
      event.preventDefault()

      // The first arrow key press puts the cursor somewhere rather than moving it.
      if (!cursor) {
        setCursor({ rowIndex: 0, columnIndex: 0 })
        setAnchor(null)
        return
      }

      // Cmd+Up/Down jumps to the ends, matching every spreadsheet.
      const resolved: CursorMove =
        isMeta && move === 'up' ? 'first-row' : isMeta && move === 'down' ? 'last-row' : move

      const next = moveCursor(cursor, resolved, bounds)
      if (event.shiftKey) {
        // Extending keeps the corner it started from, so shrinking back works.
        setAnchor((prev) => prev ?? cursor)
      } else {
        setAnchor(null)
      }
      setCursor(next)
    },
    [bounds, clear, copy, cursor, isEditing, onStartEditing, range]
  )

  return { cursor, range, selectCell, clear, isCellInRange, handleKeyDown, copy }
}

/**
 * The inline cell editing session: which cell is open, which just saved, and
 * where Tab goes next.
 *
 * It is a session rather than a single cell because a save patches `rows` in
 * place, and the editor has to survive that to move on to the next field.
 */

import * as React from 'react'

interface CellEditingOptions {
  rows: unknown[]
  /** Data column ids in the order they appear, which is the order Tab walks. */
  dataColumnIds: string[]
}

export function useCellEditing({ rows, dataColumnIds }: CellEditingOptions) {
  const [isEditorDirty, setIsEditorDirty] = React.useState(false)
  const [editingCell, setEditingCell] = React.useState<{
    rowIndex: number
    columnId: string
  } | null>(null)
  const [savedCell, setSavedCell] = React.useState<{ rowIndex: number; columnId: string } | null>(
    null
  )
  const savedFlashTimer = React.useRef<number | null>(null)
  // Cell saves patch `rows` in place; this flag keeps the editing session
  // alive across that change so Tab-to-next-cell works.
  const keepEditingOnRowsChange = React.useRef(false)

  React.useEffect(() => {
    if (keepEditingOnRowsChange.current) {
      keepEditingOnRowsChange.current = false
      return
    }
    setEditingCell(null)
    // The flash is keyed by row index; a new row set (sort/page/reload) would
    // make it light up an unrelated cell.
    setSavedCell(null)
  }, [rows])

  const markSaved = React.useCallback((rowIndex: number, columnId: string) => {
    if (savedFlashTimer.current) window.clearTimeout(savedFlashTimer.current)
    // Drop the class for a frame so re-saving the same cell within the flash
    // window restarts the CSS animation instead of silently continuing it.
    setSavedCell(null)
    requestAnimationFrame(() => {
      setSavedCell({ rowIndex, columnId })
      savedFlashTimer.current = window.setTimeout(() => setSavedCell(null), 900)
    })
  }, [])

  React.useEffect(
    () => () => {
      if (savedFlashTimer.current) window.clearTimeout(savedFlashTimer.current)
    },
    []
  )

  const moveEditing = React.useCallback(
    (rowIndex: number, columnId: string, direction: 'next' | 'prev') => {
      const colIndex = dataColumnIds.indexOf(columnId)
      if (colIndex === -1) {
        setEditingCell(null)
        return
      }
      let nextCol = colIndex + (direction === 'next' ? 1 : -1)
      let nextRow = rowIndex
      if (nextCol >= dataColumnIds.length) {
        nextCol = 0
        nextRow += 1
      } else if (nextCol < 0) {
        nextCol = dataColumnIds.length - 1
        nextRow -= 1
      }
      // At the edge of the loaded rows, stay put rather than ending the session
      // without a signal - the commit already happened either way.
      if (nextRow < 0 || nextRow >= rows.length) return
      setEditingCell({ rowIndex: nextRow, columnId: dataColumnIds[nextCol] })
    },
    [dataColumnIds, rows.length]
  )

  return {
    isEditorDirty,
    setIsEditorDirty,
    editingCell,
    setEditingCell,
    savedCell,
    markSaved,
    moveEditing,
    keepEditingOnRowsChange
  }
}

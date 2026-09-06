/**
 * Row selection, controlled or not.
 *
 * The grid is used both ways: the table view owns the selection so a toolbar can
 * act on it, while a bare grid keeps its own.
 */

import * as React from 'react'
import type { RowSelectionState } from '@tanstack/react-table'

interface RowSelectionOptions {
  rows: unknown[]
  /** Undefined leaves the grid to keep its own selection. */
  controlled?: RowSelectionState
  onChange?: (selection: RowSelectionState) => void
}

interface RowSelectionApi {
  rowSelection: RowSelectionState
  setRowSelection: (
    updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)
  ) => void
}

export function useRowSelection({
  rows,
  controlled,
  onChange
}: RowSelectionOptions): RowSelectionApi {
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({})
  const isControlled = controlled !== undefined
  const rowSelection = isControlled ? controlled : internalRowSelection
  const setRowSelection = React.useCallback(
    (updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => {
      const next =
        typeof updater === 'function'
          ? (updater as (prev: RowSelectionState) => RowSelectionState)(rowSelection)
          : updater
      if (isControlled) {
        onChange?.(next)
      } else {
        setInternalRowSelection(next)
      }
    },
    [isControlled, onChange, rowSelection]
  )

  React.useEffect(() => {
    if (isControlled) return
    setInternalRowSelection({})
  }, [rows, isControlled])

  return { rowSelection, setRowSelection }
}

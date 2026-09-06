/**
 * The last committed cell edit, and the way back from it.
 *
 * A cell edit writes the moment you leave the cell, with no confirmation, so
 * this is the only undo there is. The prompt is a hint rather than the
 * capability: it fades, but cmd-Z keeps working until another edit replaces it.
 */

import * as React from 'react'
import { useToast } from '@renderer/components/ui/toast'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { UNDO_PROMPT_MS } from '@renderer/config/site'
import type { RowsResult, TableDetails } from '@renderer/types'

interface CellUndoOptions {
  connectionId: string
  details: TableDetails
  setRows: React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>
  /** Cleared on write: the cached page is the one that just went stale. */
  prefetchCacheRef: React.MutableRefObject<{ key: string; data: RowsResult } | null>
}

export function useCellUndo({ connectionId, details, setRows, prefetchCacheRef }: CellUndoOptions) {
  const toast = useToast()
  /**
   * The last committed cell edit, kept so it can be put back. A cell edit writes
   * the moment you leave the cell, with no confirmation - this is the only way
   * back from a mistyped value.
   */
  const [lastEdit, setLastEdit] = React.useState<{
    pk: Record<string, unknown>
    column: string
    previousValue: unknown
    newValue: unknown
  } | null>(null)
  // The prompt is a hint, not the capability: it fades, but cmd-Z keeps working
  // until another edit replaces it or the table changes. Tying the two together
  // meant that looking away for a few seconds silently cost you the undo.
  const [isUndoPromptVisible, setIsUndoPromptVisible] = React.useState(false)
  const [isUndoing, setIsUndoing] = React.useState(false)

  React.useEffect(() => {
    if (!lastEdit) return
    const timer = setTimeout(() => setIsUndoPromptVisible(false), UNDO_PROMPT_MS)
    return () => clearTimeout(timer)
  }, [lastEdit])

  // The row marker points at the prompt, so it leaves with it. Bound to lastEdit
  // instead it would outlive the bar and sit there highlighted forever.
  const pendingUndoRow = isUndoPromptVisible ? (lastEdit?.pk ?? null) : null

  async function writeCell(
    pk: Record<string, unknown>,
    column: string,
    value: unknown,
    matchRow?: Record<string, unknown>
  ) {
    const updated = await unwrap(
      window.api.db.updateRow({
        connectionId,
        schema: details.schema,
        table: details.name,
        pk,
        values: { [column]: value }
      })
    )
    prefetchCacheRef.current = null
    setRows((prev) =>
      prev.map((r) => {
        const isTarget = matchRow
          ? r === matchRow
          : details.primaryKey.every((key) => r[key] === pk[key])
        if (!isTarget) return r
        // mysql/d1 re-fetch by PK can miss (e.g. concurrent delete) and return
        // {}; fall back to a local merge rather than blanking the row.
        return Object.keys(updated).length > 0 ? updated : { ...r, [column]: value }
      })
    )
  }

  async function undoLastEdit() {
    if (!lastEdit || isUndoing) return
    setIsUndoing(true)
    try {
      await writeCell(lastEdit.pk, lastEdit.column, lastEdit.previousValue)
      setLastEdit(null)
    } catch (err) {
      toast.error('Undo failed', { description: errorMessage(err) })
    } finally {
      setIsUndoing(false)
    }
  }

  React.useEffect(() => {
    if (!lastEdit) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey) return
      const target = e.target as HTMLElement | null
      // Inside a field, cmd-Z is the browser's own text undo.
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      void undoLastEdit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function handleEditCell(row: Record<string, unknown>, column: string, value: unknown) {
    const pk: Record<string, unknown> = {}
    for (const key of details.primaryKey) pk[key] = row[key]
    const previousValue = row[column]
    // Patches the saved row in place with what the DB returned (covers
    // triggers/defaults) instead of reloading - no grid flash, and the
    // cell-editing session survives for Tab navigation.
    await writeCell(pk, column, value, row)
    setLastEdit({ pk, column, previousValue, newValue: value })
    setIsUndoPromptVisible(true)
  }

  return {
    lastEdit,
    setLastEdit,
    isUndoPromptVisible,
    isUndoing,
    pendingUndoRow,
    writeCell,
    undoLastEdit,
    handleEditCell
  }
}

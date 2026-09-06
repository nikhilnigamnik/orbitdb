/**
 * What the row actions do: insert, update, and the two shapes of delete.
 *
 * The options object is wide because these handlers sit between the dialogs and
 * the grid and genuinely touch both. Threading them in beats leaving 200 lines
 * of handler in the view, and it keeps the dialogs' own state where the JSX that
 * renders them can see it.
 */

import { useToast } from '@renderer/components/ui/toast'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { formatNumber } from '@renderer/lib/format'
import { isForeignKeyError } from '../lib/delete-error'
import type { TableDetails } from '@renderer/types'

interface Disclosure {
  isOpen: boolean
  open: () => void
  close: () => void
}

type Row = Record<string, unknown>

interface RowMutationsOptions {
  connectionId: string
  details: TableDetails
  /** Reloads the page after a change that cannot be patched in place. */
  load: () => Promise<void>
  editingRow: Row | null
  pendingDelete: Row | null
  setPendingDelete: (row: Row | null) => void
  setCascadeTargets: (pks: Row[]) => void
  setIsMutating: (isMutating: boolean) => void
  selectedRows: Row[]
  setRowSelection: (selection: Record<string, boolean>) => void
  deleteConfirm: Disclosure
  bulkDeleteConfirm: Disclosure
  cascadeDialog: Disclosure
}

export function useRowMutations({
  connectionId,
  details,
  load,
  editingRow,
  pendingDelete,
  setPendingDelete,
  setCascadeTargets,
  setIsMutating,
  selectedRows,
  setRowSelection,
  deleteConfirm,
  bulkDeleteConfirm,
  cascadeDialog
}: RowMutationsOptions) {
  const toast = useToast()
  async function handleInsert(values: Record<string, unknown>) {
    await unwrap(
      window.api.db.insertRow({
        connectionId,
        schema: details.schema,
        table: details.name,
        values
      })
    )
    await load()
  }

  async function handleUpdate(values: Record<string, unknown>) {
    if (!editingRow) throw new Error('No row selected')
    const pk: Record<string, unknown> = {}
    for (const key of details.primaryKey) pk[key] = editingRow[key]
    await unwrap(
      window.api.db.updateRow({
        connectionId,
        schema: details.schema,
        table: details.name,
        pk,
        values
      })
    )
    await load()
  }

  function pkOf(row: Record<string, unknown>): Record<string, unknown> {
    const pk: Record<string, unknown> = {}
    for (const key of details.primaryKey) pk[key] = row[key]
    return pk
  }

  /**
   * A refused delete, reported as the thing it is.
   *
   * The raw constraint error is accurate but names nothing the user can act on -
   * SQLite does not even say which table is holding the row - so it becomes an
   * offer to look, and the plan behind that offer does the naming. Cascading
   * needs a primary key to walk from, so without one the error stands as it is.
   */
  function reportDeleteFailure(
    err: unknown,
    targets: Record<string, unknown>[],
    deletedCount = 0
  ): void {
    const message = errorMessage(err)
    // A bulk delete can land some rows and be refused on others. Reporting only
    // the refusal left the grid quietly shorter than the user was told.
    const partial =
      deletedCount > 0
        ? `${formatNumber(deletedCount)} row${deletedCount === 1 ? '' : 's'} deleted first. `
        : ''

    if (!isForeignKeyError(message) || details.primaryKey.length === 0) {
      toast.error('Delete failed', { description: `${partial}${message}` })
      return
    }

    const pks = targets.map(pkOf)
    toast.error('Other rows still point at this', {
      description: `${partial}The database refused the delete while something still references it.`,
      // The rows are pinned on the action rather than read back from state, so a
      // toast still on screen after a successful cascade reopens on the rows it
      // was raised for - planning those finds nothing left, which is an honest
      // empty plan rather than the "no primary key values" internal error an
      // already-cleared list produced.
      action: {
        label: 'Show what depends on it',
        onClick: () => {
          setCascadeTargets(pks)
          cascadeDialog.open()
        }
      }
    })
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setIsMutating(true)
    const target = pendingDelete
    try {
      await unwrap(
        window.api.db.deleteRow({
          connectionId,
          schema: details.schema,
          table: details.name,
          pk: pkOf(target)
        })
      )
      await load()
      deleteConfirm.close()
      setPendingDelete(null)
      toast.success('Row deleted')
    } catch (err) {
      deleteConfirm.close()
      reportDeleteFailure(err, [target])
    } finally {
      setIsMutating(false)
    }
  }

  async function handleBulkDelete() {
    if (selectedRows.length === 0) return
    setIsMutating(true)
    const targets = selectedRows
    // allSettled rather than all: the first rejection would otherwise leave the
    // rest in flight, and the count reported would be whatever had landed by
    // then rather than what actually went.
    const outcomes = await Promise.allSettled(
      targets.map((row) =>
        unwrap(
          window.api.db.deleteRow({
            connectionId,
            schema: details.schema,
            table: details.name,
            pk: pkOf(row)
          })
        )
      )
    )
    const failure = outcomes.find((outcome) => outcome.status === 'rejected')
    const deleted = outcomes.filter((outcome) => outcome.status === 'fulfilled').length
    setIsMutating(false)
    setRowSelection({})
    await load()
    bulkDeleteConfirm.close()

    if (!failure) {
      toast.success(`${deleted} row${deleted === 1 ? '' : 's'} deleted`)
      return
    }
    // Cascading is offered for the whole selection, not just the rows that
    // failed: the ones already gone plan to nothing and delete nothing, so
    // narrowing it would only risk dropping a row from the retry.
    reportDeleteFailure(failure.reason, targets, deleted)
  }

  return { handleInsert, handleUpdate, pkOf, reportDeleteFailure, handleDelete, handleBulkDelete }
}

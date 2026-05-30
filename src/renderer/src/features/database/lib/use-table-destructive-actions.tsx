import * as React from 'react'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { unwrap } from '@renderer/lib/ipc'
import type { DdlOperation } from '@renderer/types'
import { emitSchemaTablesChanged } from './schema-events'

interface UseTableDestructiveActionsOptions {
  connectionId: string
  schema: string
  table: string
  /** Called after a successful DROP (e.g. navigate away from the now-gone table). */
  onDropped?: () => void
}

type Pending = { kind: 'truncate' | 'drop'; sql: string }

function operationFor(kind: 'truncate' | 'drop'): DdlOperation {
  return kind === 'truncate' ? { kind: 'truncate-table' } : { kind: 'drop-table' }
}

/**
 * Shared truncate/drop flow: previews the SQL, confirms, executes, then signals
 * the schema tree to refresh. Returns the two request triggers plus the confirm
 * dialog element to render.
 */
export function useTableDestructiveActions({
  connectionId,
  schema,
  table,
  onDropped
}: UseTableDestructiveActionsOptions) {
  const [pending, setPending] = React.useState<Pending | null>(null)
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const request = React.useCallback(
    async (kind: 'truncate' | 'drop') => {
      setActionError(null)
      let sql = ''
      try {
        sql = await unwrap(
          window.api.db.ddlPreview({ connectionId, schema, table, operation: operationFor(kind) })
        )
      } catch {
        // Empty preview fallback — the confirm copy still explains the action.
      }
      setPending({ kind, sql })
    },
    [connectionId, schema, table]
  )

  const requestTruncate = React.useCallback(() => void request('truncate'), [request])
  const requestDrop = React.useCallback(() => void request('drop'), [request])

  async function run() {
    if (!pending) return
    setIsExecuting(true)
    setActionError(null)
    try {
      await unwrap(
        window.api.db.ddlExecute({
          connectionId,
          schema,
          table,
          operation: operationFor(pending.kind)
        })
      )
      const wasDrop = pending.kind === 'drop'
      setPending(null)
      setIsExecuting(false)
      emitSchemaTablesChanged(connectionId, schema)
      if (wasDrop) onDropped?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
      setIsExecuting(false)
    }
  }

  const title = pending?.kind === 'truncate' ? `Truncate ${table}?` : `Drop ${table}?`
  const body =
    pending?.kind === 'truncate'
      ? 'This permanently deletes every row in the table. This cannot be undone.'
      : 'This permanently removes the table and all its data. This cannot be undone.'
  const description = [
    body,
    pending?.sql ? `Runs: ${pending.sql}` : '',
    actionError ? `Error: ${actionError}` : ''
  ]
    .filter(Boolean)
    .join('  ')

  const confirmDialog = (
    <ConfirmDialog
      isOpen={pending !== null}
      onClose={() => {
        setPending(null)
        setActionError(null)
      }}
      onConfirm={run}
      title={title}
      description={description}
      confirmLabel={pending?.kind === 'truncate' ? 'Truncate' : 'Drop'}
      variant="danger"
      isLoading={isExecuting}
    />
  )

  return { requestTruncate, requestDrop, confirmDialog }
}

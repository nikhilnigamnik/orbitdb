import * as React from 'react'
import { IconPlus, IconRefresh } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { ErrorState } from '@renderer/components/common/error-state'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { unwrap } from '@renderer/lib/ipc'
import { DEFAULT_PAGE_SIZE } from '@renderer/config/site'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import type {
  ColumnInfo,
  RowFilter,
  RowsResult,
  SortDirection,
  TableDetails
} from '@renderer/types'
import { DataGrid } from './data-grid'
import { FiltersBar } from './filters-bar'
import { PaginationBar } from './pagination-bar'
import { RowEditorModal } from './row-editor-modal'

interface TableDataViewProps {
  connectionId: string
  details: TableDetails
}

export function TableDataView({ connectionId, details }: TableDataViewProps) {
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = React.useState<ColumnInfo[]>(details.columns)
  const [totalEstimate, setTotalEstimate] = React.useState<number | null>(details.estimatedRows)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [offset, setOffset] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
  const [orderBy, setOrderBy] = React.useState<string | null>(null)
  const [orderDir, setOrderDir] = React.useState<SortDirection>('asc')
  const [filters, setFilters] = React.useState<RowFilter[]>([])

  const insertModal = useDisclosure(false)
  const editModal = useDisclosure(false)
  const deleteConfirm = useDisclosure(false)
  const [editingRow, setEditingRow] = React.useState<Record<string, unknown> | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<Record<string, unknown> | null>(null)
  const [mutationError, setMutationError] = React.useState<string | null>(null)
  const [isMutating, setIsMutating] = React.useState(false)

  const canMutate = details.type === 'table' && details.primaryKey.length > 0

  const load = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data: RowsResult = await unwrap(
        window.api.db.getRows({
          connectionId,
          schema: details.schema,
          table: details.name,
          limit: pageSize,
          offset,
          orderBy: orderBy ?? undefined,
          orderDir,
          filters
        })
      )
      setRows(data.rows)
      setColumns(data.columns)
      setTotalEstimate(data.totalEstimate)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [connectionId, details.schema, details.name, pageSize, offset, orderBy, orderDir, filters])

  React.useEffect(() => {
    setOffset(0)
    setOrderBy(null)
    setOrderDir('asc')
    setFilters([])
  }, [details.schema, details.name])

  React.useEffect(() => {
    void load()
  }, [load])

  function handleSort(column: string) {
    if (orderBy === column) {
      setOrderDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setOrderBy(column)
      setOrderDir('asc')
    }
    setOffset(0)
  }

  async function handleInsert(values: Record<string, unknown>) {
    setMutationError(null)
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
    setMutationError(null)
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

  async function handleDelete() {
    if (!pendingDelete) return
    setIsMutating(true)
    setMutationError(null)
    try {
      const pk: Record<string, unknown> = {}
      for (const key of details.primaryKey) pk[key] = pendingDelete[key]
      await unwrap(
        window.api.db.deleteRow({
          connectionId,
          schema: details.schema,
          table: details.name,
          pk
        })
      )
      await load()
      deleteConfirm.close()
      setPendingDelete(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        <div className="flex items-center gap-2 text-[12px]">
          {isLoading ? (
            <Spinner size={12} />
          ) : (
            <span className="text-[var(--color-text-subtle)]">
              {rows.length} row{rows.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]"
            onClick={load}
            disabled={isLoading}
          >
            <IconRefresh size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          {canMutate && (
            <Button
              size="sm"
              className="bg-accent text-white hover:bg-accent/90"
              onClick={insertModal.open}
            >
              <IconPlus size={12} />
              Insert
            </Button>
          )}
        </div>
      </div>

      <FiltersBar
        columns={columns}
        filters={filters}
        onChange={setFilters}
        onApply={() => {
          setOffset(0)
          void load()
        }}
      />

      {error && (
        <div className="p-3">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {mutationError && (
        <div className="p-3">
          <ErrorState title="Mutation failed" message={mutationError} />
        </div>
      )}

      {!canMutate && details.type === 'table' && (
        <div className="border-b border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400">
          This table has no primary key — rows cannot be edited or deleted from the UI.
        </div>
      )}

      <DataGrid
        columns={columns}
        rows={rows}
        orderBy={orderBy}
        orderDir={orderDir}
        onSort={handleSort}
        onEditRow={(row) => {
          setEditingRow(row)
          editModal.open()
        }}
        onDeleteRow={(row) => {
          setPendingDelete(row)
          deleteConfirm.open()
        }}
        canMutate={canMutate}
      />

      <PaginationBar
        offset={offset}
        pageSize={pageSize}
        loadedCount={rows.length}
        totalEstimate={totalEstimate}
        onChangePage={setOffset}
        onChangePageSize={(size) => {
          setPageSize(size)
          setOffset(0)
        }}
      />

      <RowEditorModal
        isOpen={insertModal.isOpen}
        onClose={insertModal.close}
        mode="insert"
        columns={columns}
        onSubmit={handleInsert}
      />

      <RowEditorModal
        isOpen={editModal.isOpen}
        onClose={editModal.close}
        mode="edit"
        columns={columns}
        initialValues={editingRow}
        onSubmit={handleUpdate}
      />

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => {
          deleteConfirm.close()
          setPendingDelete(null)
        }}
        onConfirm={handleDelete}
        title="Delete row?"
        description={`This will permanently delete the row from ${details.schema}.${details.name}.`}
        confirmLabel={isMutating ? 'Deleting…' : 'Delete row'}
        variant="danger"
        isLoading={isMutating}
      />
    </div>
  )
}

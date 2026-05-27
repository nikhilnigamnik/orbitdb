import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { RowSelectionState } from '@tanstack/react-table'
import { IconDownload, IconRefresh, IconTrash, IconX } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { ErrorState } from '@renderer/components/common/error-state'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { unwrap } from '@renderer/lib/ipc'
import { buildExportFilename, downloadJson } from '@renderer/lib/export'
import { DEFAULT_PAGE_SIZE } from '@renderer/config/site'
import { tableRouteWithFk } from '@renderer/config/routes'
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
import { RowEditorSheet } from './row-editor-sheet'

interface TableDataViewProps {
  connectionId: string
  details: TableDetails
}

export function TableDataView({ connectionId, details }: TableDataViewProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fkColumn = searchParams.get('fkColumn')
  const fkValue = searchParams.get('fkValue')

  const [rows, setRows] = React.useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = React.useState<ColumnInfo[]>(details.columns)
  const [totalEstimate, setTotalEstimate] = React.useState<number | null>(details.estimatedRows)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [offset, setOffset] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
  const [orderBy, setOrderBy] = React.useState<string | null>(null)
  const [orderDir, setOrderDir] = React.useState<SortDirection>('asc')
  const [filters, setFilters] = React.useState<RowFilter[]>(() => {
    if (fkColumn && fkValue != null) {
      return [{ column: fkColumn, operator: '=', value: fkValue }]
    }
    return []
  })

  const fkByColumn = React.useMemo(() => {
    const map = new Map<string, { schema: string; table: string; column: string }>()
    for (const fk of details.foreignKeys) {
      if (fk.columns.length !== 1 || fk.referencedColumns.length !== 1) continue
      map.set(fk.columns[0], {
        schema: fk.referencedSchema,
        table: fk.referencedTable,
        column: fk.referencedColumns[0]
      })
    }
    return map
  }, [details.foreignKeys])

  const openForeignKey = React.useCallback(
    (column: string, value: unknown) => {
      const target = fkByColumn.get(column)
      if (!target || value == null) return
      navigate(tableRouteWithFk(target.schema, target.table, target.column, String(value)))
    },
    [fkByColumn, navigate]
  )

  const insertModal = useDisclosure(false)
  const editModal = useDisclosure(false)
  const deleteConfirm = useDisclosure(false)
  const bulkDeleteConfirm = useDisclosure(false)
  const [editingRow, setEditingRow] = React.useState<Record<string, unknown> | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<Record<string, unknown> | null>(null)
  const [mutationError, setMutationError] = React.useState<string | null>(null)
  const [isMutating, setIsMutating] = React.useState(false)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const selectedRows = React.useMemo(
    () =>
      Object.keys(rowSelection)
        .filter((key) => rowSelection[key])
        .map((key) => rows[Number(key)])
        .filter(Boolean),
    [rowSelection, rows]
  )
  const selectedCount = selectedRows.length

  React.useEffect(() => {
    setRowSelection({})
  }, [rows])

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
    if (orderBy !== column) {
      setOrderBy(column)
      setOrderDir('asc')
    } else if (orderDir === 'asc') {
      setOrderDir('desc')
    } else {
      setOrderBy(null)
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

  function handleExport() {
    const data = selectedRows.length > 0 ? selectedRows : rows
    if (data.length === 0) return
    downloadJson(buildExportFilename([details.schema, details.name], 'json'), data)
  }

  async function handleBulkDelete() {
    if (selectedRows.length === 0) return
    setIsMutating(true)
    setMutationError(null)
    try {
      await Promise.all(
        selectedRows.map((row) => {
          const pk: Record<string, unknown> = {}
          for (const key of details.primaryKey) pk[key] = row[key]
          return unwrap(
            window.api.db.deleteRow({
              connectionId,
              schema: details.schema,
              table: details.name,
              pk
            })
          )
        })
      )
      setRowSelection({})
      await load()
      bulkDeleteConfirm.close()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-2">
        <FiltersBar
          connectionId={connectionId}
          schema={details.schema}
          table={details.name}
          columns={columns}
          filters={filters}
          onChange={setFilters}
          onApply={() => {
            setOffset(0)
          }}
        />
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="text-text-muted hover:bg-surface-elevated hover:text-text"
            onClick={handleExport}
            disabled={rows.length === 0}
          >
            <IconDownload size={12} />
            Export
            {selectedCount > 0 && (
              <span className="ml-0.5 rounded bg-surface px-1 py-0 font-mono text-[10px] text-text-subtle">
                {selectedCount}
              </span>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-text-muted hover:bg-surface-elevated hover:text-text"
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
              Insert row
            </Button>
          )}
        </div>
      </div>

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

      <div className="relative flex min-h-0 flex-1 flex-col">
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
          rowOffset={offset}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          isLoading={isLoading}
          fkColumns={fkByColumn}
          onOpenForeignKey={openForeignKey}
        />

        {canMutate && selectedCount > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
            <div className="animate-slide-up-fade pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1.5 shadow-lg shadow-black/40">
              <span className="pl-2 text-[12px] text-text">
                <span className="font-mono text-text">{selectedCount}</span>
                <span className="text-text-subtle">
                  {' '}
                  row{selectedCount === 1 ? '' : 's'} selected
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-full px-2 text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={() => setRowSelection({})}
              >
                <IconX size={12} />
                Clear
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1 rounded-full bg-red-500/90 px-2.5 text-white hover:bg-red-500"
                onClick={bulkDeleteConfirm.open}
              >
                <IconTrash size={12} />
                Delete {selectedCount}
              </Button>
            </div>
          </div>
        )}
      </div>

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

      <RowEditorSheet
        isOpen={insertModal.isOpen}
        onClose={insertModal.close}
        mode="insert"
        columns={columns}
        onSubmit={handleInsert}
      />

      <RowEditorSheet
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

      <ConfirmDialog
        isOpen={bulkDeleteConfirm.isOpen}
        onClose={bulkDeleteConfirm.close}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedCount} row${selectedCount === 1 ? '' : 's'}?`}
        description={`This will permanently delete ${selectedCount} row${selectedCount === 1 ? '' : 's'} from ${details.schema}.${details.name}.`}
        confirmLabel={isMutating ? 'Deleting…' : `Delete ${selectedCount}`}
        variant="danger"
        isLoading={isMutating}
      />
    </div>
  )
}

import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { RowSelectionState } from '@tanstack/react-table'
import { IconDownload, IconTrash, IconX } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { ErrorState } from '@renderer/components/common/error-state'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { LoadingState } from '@renderer/components/common/loading-state'
import { unwrap } from '@renderer/lib/ipc'
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
import { ExportMenu } from './export-menu'
import { TableOverflowMenu } from './table-overflow-menu'
import { FiltersBar } from './filters-bar'
import { PaginationBar } from './pagination-bar'
import { RowEditorSheet } from './row-editor-sheet'

interface TableDataViewProps {
  connectionId: string
  details: TableDetails
  /** Opens the DDL rename dialog (table-only); surfaced in the overflow menu. */
  onRenameTable?: () => void
  /** Fires once the first page of rows has loaded, so the container can reveal chrome. */
  onReady?: () => void
}

export function TableDataView({
  connectionId,
  details,
  onRenameTable,
  onReady
}: TableDataViewProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fkColumn = searchParams.get('fkColumn')
  const fkValue = searchParams.get('fkValue')

  const [rows, setRows] = React.useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = React.useState<ColumnInfo[]>(details.columns)
  const [totalEstimate, setTotalEstimate] = React.useState<number | null>(details.estimatedRows)
  const [isLoading, setIsLoading] = React.useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false)
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

  const requestIdRef = React.useRef(0)
  const prefetchCacheRef = React.useRef<{ key: string; data: RowsResult } | null>(null)

  const load = React.useCallback(async () => {
    const requestId = ++requestIdRef.current
    const queryKey = JSON.stringify({
      connectionId,
      schema: details.schema,
      table: details.name,
      pageSize,
      offset,
      orderBy,
      orderDir,
      filters
    })

    let data: RowsResult
    const cached = prefetchCacheRef.current
    if (cached?.key === queryKey) {
      data = cached.data
      prefetchCacheRef.current = null
      setRows(data.rows)
      setColumns(data.columns)
      setTotalEstimate(data.totalEstimate)
      setHasLoadedOnce(true)
      setIsLoading(false)
      setError(null)
    } else {
      prefetchCacheRef.current = null
      setIsLoading(true)
      setError(null)
      try {
        data = await unwrap(
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
        if (requestId !== requestIdRef.current) return
        setRows(data.rows)
        setColumns(data.columns)
        setTotalEstimate(data.totalEstimate)
        setHasLoadedOnce(true)
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        setError(err instanceof Error ? err.message : String(err))
        return
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false)
      }
    }

    const nextOffset = offset + pageSize
    const hasNextPage =
      data.rows.length === pageSize &&
      (data.totalEstimate == null || nextOffset < data.totalEstimate)
    if (!hasNextPage) return

    const nextKey = JSON.stringify({
      connectionId,
      schema: details.schema,
      table: details.name,
      pageSize,
      offset: nextOffset,
      orderBy,
      orderDir,
      filters
    })

    void (async () => {
      try {
        const nextData: RowsResult = await unwrap(
          window.api.db.getRows({
            connectionId,
            schema: details.schema,
            table: details.name,
            limit: pageSize,
            offset: nextOffset,
            orderBy: orderBy ?? undefined,
            orderDir,
            filters
          })
        )
        prefetchCacheRef.current = { key: nextKey, data: nextData }
      } catch {
        // silent — prefetch failures shouldn't surface
      }
    })()
  }, [connectionId, details.schema, details.name, pageSize, offset, orderBy, orderDir, filters])

  React.useEffect(() => {
    setOffset(0)
    setOrderBy(null)
    setOrderDir('asc')
    setFilters([])
    setRows([])
    setHasLoadedOnce(false)
    prefetchCacheRef.current = null
  }, [details.schema, details.name])

  React.useEffect(() => {
    void load()
  }, [load])

  // Signal the container once the first page lands, so it can reveal the header
  // and grid together — a single loader instead of loader-then-loader.
  const onReadyRef = React.useRef(onReady)
  onReadyRef.current = onReady
  React.useEffect(() => {
    if (hasLoadedOnce) onReadyRef.current?.()
  }, [hasLoadedOnce])

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

  async function handleEditCell(row: Record<string, unknown>, column: string, value: unknown) {
    const pk: Record<string, unknown> = {}
    for (const key of details.primaryKey) pk[key] = row[key]
    await unwrap(
      window.api.db.updateRow({
        connectionId,
        schema: details.schema,
        table: details.name,
        pk,
        values: { [column]: value }
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

  // Hold the whole view behind one full-area loader until the first page is in,
  // so the header/filters/grid all appear at once.
  if (!hasLoadedOnce) {
    if (error) {
      return (
        <div className="p-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )
    }
    return <LoadingState />
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
          {canMutate && (
            <Button
              size="sm"
              className="bg-accent text-white hover:bg-accent/90"
              onClick={insertModal.open}
            >
              Insert row
            </Button>
          )}
          <TableOverflowMenu
            connectionId={connectionId}
            details={details}
            exportRows={selectedRows.length > 0 ? selectedRows : rows}
            exportColumns={columns.map((c) => c.name)}
            onRefresh={load}
            onRenameTable={onRenameTable}
          />
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
          onEditCell={canMutate ? handleEditCell : undefined}
          canMutate={canMutate}
          rowOffset={offset}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          isLoading={isLoading}
          isInitialLoad={isLoading && !hasLoadedOnce}
          fkColumns={fkByColumn}
          onOpenForeignKey={openForeignKey}
        />

        {selectedCount > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
            <div className="animate-slide-up-fade pointer-events-auto flex items-center gap-1.5 rounded-lg border border-border bg-surface/90 px-1.5 py-1.5 shadow-xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-md">
              <span className="flex items-center gap-1.5 pl-1.5 pr-0.5 text-[12px]">
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-surface-elevated px-1 font-mono text-[11px] font-medium text-text ring-1 ring-white/5">
                  {selectedCount}
                </span>
                <span className="text-text-subtle">
                  row{selectedCount === 1 ? '' : 's'} selected
                </span>
              </span>

              <span className="mx-0.5 h-5 w-px bg-border" />

              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-md px-2 text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={() => setRowSelection({})}
              >
                <IconX size={12} />
                Clear
              </Button>
              <ExportMenu
                rows={selectedRows}
                columns={columns.map((c) => c.name)}
                filenameParts={[details.schema, details.name]}
                side="top"
                align="center"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 rounded-md px-2 text-text-muted hover:bg-surface-elevated hover:text-text"
                >
                  <IconDownload size={12} />
                  Export {selectedCount}
                </Button>
              </ExportMenu>
              {canMutate && (
                <>
                  <span className="mx-0.5 h-5 w-px bg-border" />
                  <Button
                    size="sm"
                    className="h-7 gap-1 rounded-md bg-red-500/90 px-2.5 text-white shadow-sm shadow-red-950/40 hover:bg-red-500"
                    onClick={bulkDeleteConfirm.open}
                  >
                    <IconTrash size={12} />
                    Delete {selectedCount}
                  </Button>
                </>
              )}
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

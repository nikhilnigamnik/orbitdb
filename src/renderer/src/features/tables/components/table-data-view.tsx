import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { RowSelectionState } from '@tanstack/react-table'
import { IconDownload, IconSeeding, IconTrash, IconX } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Kbd } from '@renderer/components/ui/kbd'
import { AiPrompt } from '@renderer/features/query/components/ai-prompt'
import { SeedDataDialog } from '@renderer/features/database/components/seed-data-dialog'
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

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

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

  const aiPrompt = useDisclosure(false)
  const seedDialog = useDisclosure(false)
  const [isAiFiltering, setIsAiFiltering] = React.useState(false)
  const [aiError, setAiError] = React.useState<string | null>(null)

  const openAiPrompt = aiPrompt.open
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        openAiPrompt()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [openAiPrompt])
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
      setRowSelection({})
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
        setRowSelection({})
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
    setRowSelection({})
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

  async function handleAiFilter(prompt: string) {
    setIsAiFiltering(true)
    setAiError(null)
    try {
      const result = await unwrap(
        window.api.ai.filterTable({
          connectionId,
          schema: details.schema,
          table: details.name,
          prompt
        })
      )
      setFilters(result.filters)
      setOrderBy(result.orderBy ?? null)
      setOrderDir(result.orderDir ?? 'asc')
      setOffset(0)
      aiPrompt.close()
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsAiFiltering(false)
    }
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
    const updated = await unwrap(
      window.api.db.updateRow({
        connectionId,
        schema: details.schema,
        table: details.name,
        pk,
        values: { [column]: value }
      })
    )
    // The prefetched next page was fetched before this mutation — drop it so
    // paging forward can't render stale pre-edit rows.
    prefetchCacheRef.current = null
    // mysql/d1 re-fetch by PK can miss (e.g. concurrent delete) and return {};
    // fall back to a local merge rather than blanking the row.
    const patched = Object.keys(updated).length > 0 ? updated : { ...row, [column]: value }
    // Patch the saved row in place with what the DB returned (covers
    // triggers/defaults) instead of reloading — no grid flash, and the
    // cell-editing session survives for Tab navigation.
    setRows((prev) => prev.map((r) => (r === row ? patched : r)))
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
          <button
            type="button"
            onClick={aiPrompt.open}
            aria-label="Filter this table with natural language"
            className="group flex h-8 w-72 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-input px-2.5 text-left transition-colors hover:bg-surface-elevated/40 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
          >
            <span className="flex-1 truncate text-xs text-text-subtle transition-colors group-hover:text-text-muted">
              Describe the rows you want…
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>I</Kbd>
            </span>
          </button>
          {details.type === 'table' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={seedDialog.open}
              title="Generate sample rows with AI"
            >
              <IconSeeding size={12} />
              Seed data
            </Button>
          )}
          {canMutate && (
            <Button
              size="sm"
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

      {aiError && (
        <div className="p-3">
          <ErrorState title="AI filter failed" message={aiError} />
        </div>
      )}

      {!canMutate && details.type === 'table' && (
        <div className="border-b border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
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
            <div className="animate-slide-up-fade pointer-events-auto flex items-center gap-1 rounded-full border border-border-strong/70 bg-surface/95 py-1.5 pl-2 pr-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
              <span className="flex items-center gap-2 pl-1 pr-1.5 text-xs">
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-surface-elevated px-1.5 font-mono text-xs font-medium text-text ring-1 ring-inset ring-white/10">
                  {selectedCount}
                </span>
                <span className="text-text-subtle">
                  row{selectedCount === 1 ? '' : 's'} selected
                </span>
              </span>

              <span className="mx-1 h-4 w-px bg-white/10" />

              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-full px-2.5 text-text-muted hover:bg-surface-elevated hover:text-text"
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
                  className="h-7 gap-1 rounded-full px-2.5 text-text-muted hover:bg-surface-elevated hover:text-text"
                >
                  <IconDownload size={12} />
                  Export {selectedCount}
                </Button>
              </ExportMenu>
              {canMutate && (
                <>
                  <span className="mx-1 h-4 w-px bg-white/10" />
                  <Button
                    size="sm"
                    className="h-7 gap-1 rounded-full bg-danger-fill px-3 text-white ring-1 ring-inset ring-white/15 shadow-md shadow-danger-fill/40 hover:bg-danger"
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

      <AiPrompt
        open={aiPrompt.isOpen}
        onOpenChange={(open) => (open ? aiPrompt.open() : aiPrompt.close())}
        onSubmit={handleAiFilter}
        isGenerating={isAiFiltering}
        placeholder={`Filter ${details.name}…`}
        suggestions={[
          'rows created in the last 7 days',
          'where status is active',
          'most recent 100 rows'
        ]}
      />

      <SeedDataDialog
        open={seedDialog.isOpen}
        onClose={seedDialog.close}
        connectionId={connectionId}
        schema={details.schema}
        table={details.name}
        onApplied={load}
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

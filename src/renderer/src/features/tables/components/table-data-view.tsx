import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import type { RowSelectionState } from '@tanstack/react-table'
import { IconSeeding } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Kbd } from '@renderer/components/ui/kbd'
import { useToast } from '@renderer/components/ui/toast'
import { AiPrompt } from '@renderer/features/query/components/ai-prompt'
import { SeedDataDialog } from '@renderer/features/database/components/seed-data-dialog'
import { ErrorState } from '@renderer/components/common/error-state'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { LoadingState } from '@renderer/components/common/loading-state'
import { formatNumber } from '@renderer/lib/format'
import { errorMessage } from '@renderer/lib/errors'
import {
  MAX_FROZEN_COLUMNS,
  saveViewPrefs,
  toggleFrozenColumn,
  toggleHiddenColumn,
  type TableViewPrefs
} from '@renderer/features/tables/lib/view-prefs'
import { applyViewToPrefs, captureView } from '@renderer/features/tables/lib/saved-views'
import { useAiFilter } from '../hooks/use-ai-filter'
import { useSavedViews } from '@renderer/features/tables/hooks/use-saved-views'
import { tableRouteWithFk } from '@renderer/config/routes'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import type { DatabaseEngine, SavedTableView, SortDirection, TableDetails } from '@renderer/types'
import { DataGrid } from './data-grid'
import { TableOverflowMenu } from './table-overflow-menu'
import { FiltersBar } from './filters-bar'
import { PaginationBar } from './pagination-bar'
import { RowEditorSheet } from './row-editor-sheet'
import { RecordViewSheet } from './record-view-sheet'
import { ColumnVisibilityMenu } from './column-visibility-menu'
import { SavedViewsMenu } from './saved-views-menu'
import { CascadeDeleteDialog } from './cascade-delete-dialog'
import type { CopyFormat } from '../hooks/use-grid-cursor'

import { useFilterParams } from '../hooks/use-filter-params'
import { useTableRows } from '../hooks/use-table-rows'
import { useCellUndo } from '../hooks/use-cell-undo'
import { useRowMutations } from '../hooks/use-row-mutations'
import { UndoPrompt } from './undo-prompt'
import { SelectionBar } from './selection-bar'

interface TableDataViewProps {
  connectionId: string
  details: TableDetails
  /** Decides the quoting used by `copy as INSERT`. */
  engine?: DatabaseEngine
  /** Opens the DDL rename dialog (table-only); surfaced in the overflow menu. */
  onRenameTable?: () => void
  /** Fires once the first page of rows has loaded, so the container can reveal chrome. */
  onReady?: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const COPY_FORMAT_LABEL: Record<CopyFormat, string> = {
  tsv: 'text',
  json: 'JSON',
  sql: 'SQL'
}

export function TableDataView({
  connectionId,
  details,
  engine = 'postgres',
  onRenameTable,
  onReady
}: TableDataViewProps) {
  const navigate = useNavigate()
  const toast = useToast()

  const [offset, setOffset] = React.useState(0)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const backToFirstPage = React.useCallback(() => setOffset(0), [])

  const {
    filters,
    filterJoin,
    setFilters,
    setFilterJoin,
    setFiltersState,
    setFilterJoinState,
    writeFilterParams
  } = useFilterParams({ onAdopt: backToFirstPage })

  const {
    rows,
    setRows,
    columns,
    totalEstimate,
    totalExact,
    isLoading,
    hasLoadedOnce,
    error,
    prefs,
    setPrefs,
    pageSize,
    setPageSize,
    orderBy,
    setOrderBy,
    orderDir,
    setOrderDir,
    load,
    prefetchCacheRef
  } = useTableRows({
    connectionId,
    details,
    filters,
    filterJoin,
    offset,
    setOffset,
    setFilters,
    setFiltersState,
    setFilterJoinState,
    writeFilterParams,
    setRowSelection,
    onReady
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
  const { aiSuggestions, aiPrompt, isAiFiltering, handleAiFilter } = useAiFilter({
    connectionId,
    details,
    setFilters,
    setOrderBy,
    setOrderDir,
    setOffset
  })

  const seedDialog = useDisclosure(false)
  const insertModal = useDisclosure(false)
  const editModal = useDisclosure(false)
  const recordView = useDisclosure(false)
  const [inspectingRow, setInspectingRow] = React.useState<Record<string, unknown> | null>(null)
  const deleteConfirm = useDisclosure(false)
  const bulkDeleteConfirm = useDisclosure(false)
  const cascadeDialog = useDisclosure(false)
  const [editingRow, setEditingRow] = React.useState<Record<string, unknown> | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<Record<string, unknown> | null>(null)
  // Held separately from the selection: the rows a cascade was offered for are
  // the ones the failed delete was aiming at, and clearing the grid selection
  // afterwards must not change what the dialog is about.
  const [cascadeTargets, setCascadeTargets] = React.useState<Record<string, unknown>[]>([])
  const [isMutating, setIsMutating] = React.useState(false)
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

  /**
   * Writes the view preferences through. Called at each mutation point rather
   * than from an effect watching the state: on a table change the effect would
   * still be holding the previous table's sort and would save it under the new
   * table's key.
   */
  function persistPrefs(patch: Partial<TableViewPrefs>) {
    const next: TableViewPrefs = { ...prefs, orderBy, orderDir, pageSize, ...patch }
    setPrefs(next)
    saveViewPrefs(connectionId, details.schema, details.name, next)
  }

  // Named ways of looking at this table, kept in userData rather than beside the
  // widths in localStorage: a view the user named is theirs, not view state.
  const currentView = React.useMemo(
    () => captureView({ filters, filterJoin, orderBy, orderDir, prefs }),
    [filters, filterJoin, orderBy, orderDir, prefs]
  )
  const savedViews = useSavedViews(
    { connectionId, schema: details.schema, table: details.name },
    currentView
  )

  function applySavedView(view: SavedTableView) {
    const nextPrefs = applyViewToPrefs(view.view, prefs)
    setPrefs(nextPrefs)
    saveViewPrefs(connectionId, details.schema, details.name, nextPrefs)
    setOrderBy(view.view.orderBy)
    setOrderDir(view.view.orderDir)
    setPageSize(view.view.pageSize)
    // Both filter pieces at once, so the URL is written from the pair rather
    // than from one of them and whatever the other still held this render.
    setFiltersState(view.view.filters)
    setFilterJoinState(view.view.filterJoin)
    writeFilterParams(view.view.filters, view.view.filterJoin)
    setOffset(0)
    savedViews.markApplied(view.id)
  }

  function handleSort(column: string) {
    let nextOrderBy: string | null = column
    let nextOrderDir: SortDirection = 'asc'
    if (orderBy === column) {
      if (orderDir === 'asc') {
        nextOrderDir = 'desc'
      } else {
        nextOrderBy = null
      }
    }
    setOrderBy(nextOrderBy)
    setOrderDir(nextOrderDir)
    setOffset(0)
    persistPrefs({ orderBy: nextOrderBy, orderDir: nextOrderDir })
  }

  const visibleColumns = React.useMemo(
    () => columns.filter((column) => !prefs.hiddenColumns.includes(column.name)),
    [columns, prefs.hiddenColumns]
  )

  const { lastEdit, isUndoPromptVisible, isUndoing, pendingUndoRow, undoLastEdit, handleEditCell } =
    useCellUndo({ connectionId, details, setRows, prefetchCacheRef })

  const { handleInsert, handleUpdate, handleDelete, handleBulkDelete } = useRowMutations({
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
  })

  // Hold the whole view behind one full-area loader until the first page is in,
  // so the header/filters/grid all appear at once.
  if (!hasLoadedOnce) {
    if (error) {
      return (
        <div className="p-4">
          <ErrorState
            message={error}
            onRetry={load}
            // A deep link carrying a bad ?filters= fails here, where Retry can
            // only fail again - clearing them is the only way out.
            secondaryAction={
              filters.length > 0
                ? { label: 'Clear filters', onClick: () => setFilters([]) }
                : undefined
            }
          />
        </div>
      )
    }
    return <LoadingState />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SavedViewsMenu
            views={savedViews.views}
            activeView={savedViews.activeView}
            isDirty={savedViews.isDirty}
            isBusy={savedViews.isSaving}
            onApply={applySavedView}
            onSave={(name) => void savedViews.save(name)}
            onOverwrite={(view) => void savedViews.patch(view, { useCurrent: true })}
            onRename={(view, name) => void savedViews.patch(view, { name })}
            onDelete={(view) => void savedViews.remove(view)}
          />
          <FiltersBar
            connectionId={connectionId}
            schema={details.schema}
            table={details.name}
            columns={columns}
            filters={filters}
            onChange={setFilters}
            join={filterJoin}
            onChangeJoin={setFilterJoin}
            onApply={() => {
              setOffset(0)
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={aiPrompt.open}
            aria-label="Filter this table with natural language"
            className="group flex h-7 w-72 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-input px-2.5 text-left transition-colors hover:bg-surface-elevated/40 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
          >
            <span className="flex-1 truncate text-xs text-text-subtle transition-colors group-hover:text-text-muted">
              Describe the rows you want…
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>I</Kbd>
            </span>
          </button>
          <ColumnVisibilityMenu
            columns={columns}
            hiddenColumns={prefs.hiddenColumns}
            frozenColumns={prefs.frozenColumns}
            canFreezeMore={prefs.frozenColumns.length < MAX_FROZEN_COLUMNS}
            onToggle={(column) =>
              persistPrefs({
                hiddenColumns: toggleHiddenColumn(
                  prefs.hiddenColumns,
                  column,
                  columns.map((c) => c.name)
                ),
                // A hidden column cannot stay pinned to the left of a grid it
                // is no longer in.
                frozenColumns: prefs.hiddenColumns.includes(column)
                  ? prefs.frozenColumns
                  : prefs.frozenColumns.filter((c) => c !== column)
              })
            }
            onToggleFrozen={(column) =>
              persistPrefs({ frozenColumns: toggleFrozenColumn(prefs.frozenColumns, column) })
            }
            onShowAll={() => persistPrefs({ hiddenColumns: [] })}
          />
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
            <Button size="sm" onClick={insertModal.open}>
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

      {!canMutate && details.type === 'table' && (
        <div className="border-b border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
          This table has no primary key - rows cannot be edited or deleted from the UI.
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataGrid
          columns={visibleColumns}
          rows={rows}
          orderBy={orderBy}
          orderDir={orderDir}
          onSort={handleSort}
          onEditRow={(row) => {
            setEditingRow(row)
            editModal.open()
          }}
          onInspectRow={(row) => {
            setInspectingRow(row)
            recordView.open()
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
          pendingUndoRow={pendingUndoRow}
          insertTarget={{ schema: details.schema, table: details.name, engine }}
          columnSizing={prefs.columnSizing}
          frozenColumns={prefs.frozenColumns}
          onColumnSizingCommit={(columnSizing) => persistPrefs({ columnSizing })}
          onCopied={(format, cellCount) =>
            toast.success(
              `Copied ${cellCount} cell${cellCount === 1 ? '' : 's'} as ${COPY_FORMAT_LABEL[format]}`
            )
          }
          onCopyFailed={(err) => toast.error('Could not copy', { description: errorMessage(err) })}
          hasFilters={filters.length > 0}
          onClearFilters={() => {
            setFilters([])
            setOffset(0)
          }}
        />

        {lastEdit && isUndoPromptVisible && selectedCount === 0 && (
          <UndoPrompt edit={lastEdit} isUndoing={isUndoing} onUndo={() => void undoLastEdit()} />
        )}

        {selectedCount > 0 && (
          <SelectionBar
            count={selectedCount}
            rows={selectedRows}
            columns={visibleColumns.map((c) => c.name)}
            schema={details.schema}
            table={details.name}
            engine={engine}
            canMutate={canMutate}
            onClear={() => setRowSelection({})}
            onDelete={bulkDeleteConfirm.open}
            onCopied={(label) =>
              toast.success(
                `Copied ${selectedCount} row${selectedCount === 1 ? '' : 's'} as ${label}`
              )
            }
            onCopyFailed={(err) =>
              toast.error('Could not copy', { description: errorMessage(err) })
            }
          />
        )}
      </div>

      <PaginationBar
        offset={offset}
        pageSize={pageSize}
        loadedCount={rows.length}
        totalEstimate={totalEstimate}
        totalExact={totalExact}
        onChangePage={setOffset}
        onChangePageSize={(size) => {
          setPageSize(size)
          setOffset(0)
          persistPrefs({ pageSize: size })
        }}
      />

      <AiPrompt
        open={aiPrompt.isOpen}
        onOpenChange={(open) => (open ? aiPrompt.open() : aiPrompt.close())}
        onSubmit={handleAiFilter}
        isGenerating={isAiFiltering}
        placeholder={`Filter ${details.name}…`}
        suggestions={aiSuggestions}
      />

      <SeedDataDialog
        open={seedDialog.isOpen}
        onClose={seedDialog.close}
        connectionId={connectionId}
        schema={details.schema}
        table={details.name}
        onApplied={load}
      />

      <RecordViewSheet
        isOpen={recordView.isOpen}
        onClose={recordView.close}
        connectionId={connectionId}
        schema={details.schema}
        table={details.name}
        columns={columns}
        row={inspectingRow}
        foreignKeys={details.foreignKeys}
        onOpenForeignKey={(column, value) => {
          recordView.close()
          openForeignKey(column, value)
        }}
        onEdit={
          canMutate
            ? (row) => {
                recordView.close()
                setEditingRow(row)
                editModal.open()
              }
            : undefined
        }
        onCopied={(label) => toast.success(`Copied the record as ${label}`)}
        onCopyFailed={(err) => toast.error('Could not copy', { description: errorMessage(err) })}
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
        connectionId={connectionId}
        schema={details.schema}
        table={details.name}
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

      <CascadeDeleteDialog
        isOpen={cascadeDialog.isOpen}
        onClose={cascadeDialog.close}
        connectionId={connectionId}
        schema={details.schema}
        table={details.name}
        pks={cascadeTargets}
        onDeleted={(result) => {
          cascadeDialog.close()
          setCascadeTargets([])
          setPendingDelete(null)
          setRowSelection({})
          void load()
          const summary = result.deleted
            .map((entry) => `${entry.table} ${formatNumber(entry.rows)}`)
            .join(' · ')
          toast.success(`${formatNumber(result.totalRows)} rows deleted`, {
            // D1 has no transaction to hold the sequence together, so what the
            // result names is what landed rather than a set that either all
            // went or none did.
            description: result.wasAtomic ? summary : `${summary} · applied one statement at a time`
          })
        }}
      />
    </div>
  )
}

import * as React from 'react'
import { IconFilterOff, IconTable } from '@tabler/icons-react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowData,
  type RowSelectionState,
  type SortingState
} from '@tanstack/react-table'
import { cn } from '@renderer/lib/utils'
import { LoadingState } from '@renderer/components/common/loading-state'
import { Button } from '@renderer/components/ui/button'
import type { ColumnInfo, SortDirection } from '@renderer/types'
import { useGridCursor, type CopyFormat } from '../hooks/use-grid-cursor'
import { useGridColumns } from '../hooks/use-grid-columns'
import { useCellEditing } from '../hooks/use-cell-editing'
import { useColumnSizing } from '../hooks/use-column-sizing'
import { useRowSelection } from '../hooks/use-row-selection'
import { useStableCallback } from '../hooks/use-stable-callback'
import { revealDelta, stickyWidth } from '../lib/reveal-cell'
import { INDEX_COLUMN_WIDTH, SELECT_COLUMN_WIDTH, orderColumns } from '../lib/frozen-columns'
import type { InsertTarget } from '../lib/clipboard-format'
import { isSingleCell } from '../lib/grid-cursor'
import {
  ACTIONS_COLUMN_ID,
  INDEX_COLUMN_ID,
  SELECT_COLUMN_ID,
  type ForeignKeyTarget,
  type Row
} from '../lib/grid-types'
import { GridRow, gridCellId, type GridRowHandlers, type GridRowLayout } from './grid-row'

interface DataGridProps {
  columns: ColumnInfo[]
  rows: Row[]
  orderBy: string | null
  orderDir: SortDirection
  onSort: (column: string) => void
  onEditRow: (row: Row) => void
  onDeleteRow: (row: Row) => void
  /** Opens the read-only record view. Also bound to Shift+Enter on the cursor row. */
  onInspectRow?: (row: Row) => void
  onEditCell?: (row: Row, column: string, value: unknown) => Promise<void>
  canMutate: boolean
  rowOffset?: number
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (selection: RowSelectionState) => void
  isLoading?: boolean
  isInitialLoad?: boolean
  fkColumns?: Map<string, ForeignKeyTarget>
  onOpenForeignKey?: (column: string, value: unknown) => void
  /** Set when filters are narrowing the result, so empty can say why. */
  hasFilters?: boolean
  onClearFilters?: () => void
  /** Primary key of the row a pending undo belongs to, highlighted while it lasts. */
  pendingUndoRow?: Record<string, unknown> | null
  /** Identifies the table for `copy as INSERT`. Without it that format is unavailable. */
  insertTarget?: InsertTarget
  /** Restored widths, keyed by column name. */
  columnSizing?: Record<string, number>
  /** Pinned to the left edge, in this order. */
  frozenColumns?: string[]
  /** Fires when a resize finishes, not per frame - this is persisted. */
  onColumnSizingCommit?: (sizing: Record<string, number>) => void
  onCopied?: (format: CopyFormat, cellCount: number) => void
  onCopyFailed?: (error: unknown) => void
  /** Rows matching the current filters, across every page, when known. */
  totalRows?: number | null
}

export function DataGrid({
  columns: unorderedColumns,
  rows,
  orderBy,
  orderDir,
  onSort,
  onEditRow,
  onDeleteRow,
  onInspectRow,
  onEditCell,
  canMutate,
  rowOffset = 0,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
  isLoading = false,
  isInitialLoad = false,
  fkColumns,
  onOpenForeignKey,
  hasFilters = false,
  onClearFilters,
  pendingUndoRow,
  insertTarget,
  columnSizing: savedColumnSizing,
  frozenColumns = NO_FROZEN,
  onColumnSizingCommit,
  onCopied,
  onCopyFailed,
  totalRows
}: DataGridProps) {
  // Pinned columns move to the front here rather than at the call site, so the
  // cursor and the clipboard both see the order actually on screen.
  const columns = React.useMemo(
    () => orderColumns(unorderedColumns, frozenColumns),
    [unorderedColumns, frozenColumns]
  )

  const { rowSelection, setRowSelection } = useRowSelection({
    rows,
    controlled: controlledRowSelection,
    onChange: onRowSelectionChange
  })

  const dataColumnIds = React.useMemo(() => columns.map((c) => c.name), [columns])
  const canEditCells = canMutate && !!onEditCell

  const {
    isEditorDirty,
    setIsEditorDirty,
    editingCell,
    setEditingCell,
    savedCell,
    markSaved,
    moveEditing,
    keepEditingOnRowsChange
  } = useCellEditing({ rows, dataColumnIds })

  const sorting: SortingState = React.useMemo(
    () => (orderBy ? [{ id: orderBy, desc: orderDir === 'desc' }] : []),
    [orderBy, orderDir]
  )

  const gridId = React.useId()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const gridRef = React.useRef<HTMLTableElement>(null)

  const tableColumns = useGridColumns({
    columns,
    orderBy,
    orderDir,
    onSort,
    hasActions: canMutate || !!onInspectRow
  })

  const {
    columnSizing,
    setColumnSizing,
    isAnyFrozen,
    widthVars,
    cellStyles,
    resizingColumn,
    startResize,
    resetColumnSize
  } = useColumnSizing({
    columnIds: dataColumnIds,
    savedColumnSizing,
    frozenColumns,
    onColumnSizingCommit
  })

  const table = useReactTable<Row>({
    data: rows,
    columns: tableColumns,
    state: { sorting, rowSelection, columnSizing },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: setColumnSizing,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel()
  })
  const tableRows = table.getRowModel().rows

  const toggleRow = useStableCallback((rowIndex: number, isSelected?: boolean) => {
    tableRows[rowIndex]?.toggleSelected(isSelected)
  })
  const rowAt = (rowIndex: number): Row | undefined => rows[rowIndex]
  const openRowAt = useStableCallback((rowIndex: number) => {
    const row = rowAt(rowIndex)
    if (row) onInspectRow?.(row)
  })
  const deleteRowAt = useStableCallback((rowIndex: number) => {
    const row = rowAt(rowIndex)
    if (row) onDeleteRow(row)
  })

  const {
    cursor,
    range,
    selectCell,
    clear: clearCursor,
    handleKeyDown
  } = useGridCursor({
    rows,
    columnIds: dataColumnIds,
    isEditing: editingCell != null,
    onStartEditing: canEditCells
      ? ({ rowIndex, columnIndex }) =>
          setEditingCell({ rowIndex, columnId: dataColumnIds[columnIndex] })
      : undefined,
    insertTarget: insertTarget ?? NO_INSERT_TARGET,
    onCopied,
    onCopyFailed,
    onToggleRow: toggleRow,
    onOpenRow: onInspectRow ? openRowAt : undefined,
    // The handler opens the existing confirm; nothing is deleted from a key.
    onDeleteRow: canMutate ? deleteRowAt : undefined
  })

  /**
   * Keep the cursor on screen.
   *
   * Arrow keys moved the cursor without moving the view, so stepping right off
   * the visible edge left it behind the sticky columns with nothing to show
   * where it had gone.
   */
  React.useEffect(() => {
    const container = scrollRef.current
    if (!container || !cursor) return
    const cell = document.getElementById(gridCellId(gridId, cursor.rowIndex, cursor.columnIndex))
    if (!cell) return

    const row = cell.parentElement
    const insets = {
      left: row ? stickyWidth(row.querySelectorAll('[data-sticky="left"]')) : 0,
      right: row ? stickyWidth(row.querySelectorAll('[data-sticky="right"]')) : 0,
      top: container.querySelector('thead')?.getBoundingClientRect().height ?? 0
    }
    const { left, top } = revealDelta(
      container.getBoundingClientRect(),
      cell.getBoundingClientRect(),
      insets
    )
    if (left !== 0 || top !== 0) container.scrollBy({ left, top })
  }, [cursor, gridId])

  const handleSelectCell = useStableCallback(
    (rowIndex: number, columnIndex: number, extend: boolean) => {
      selectCell(rowIndex, columnIndex, extend)
      // The mousedown's preventDefault can cost the grid its focus, and without
      // focus the arrow keys go nowhere.
      if (!editingCell) gridRef.current?.focus()
    }
  )
  const startEditing = useStableCallback((rowIndex: number, columnId: string) =>
    setEditingCell({ rowIndex, columnId })
  )
  const closeEditor = useStableCallback(() => setEditingCell(null))
  const saveCell = useStableCallback(
    async (rowIndex: number, row: Row, columnId: string, value: unknown) => {
      if (!onEditCell) return
      keepEditingOnRowsChange.current = true
      try {
        await onEditCell(row, columnId, value)
      } catch (err) {
        keepEditingOnRowsChange.current = false
        throw err
      }
      markSaved(rowIndex, columnId)
    }
  )
  const handleMoveEditing = useStableCallback(moveEditing)
  const inspectRow = useStableCallback((row: Row) => onInspectRow?.(row))
  const editRow = useStableCallback(onEditRow)
  const deleteRow = useStableCallback(onDeleteRow)
  const openForeignKey = useStableCallback((column: string, value: unknown) =>
    onOpenForeignKey?.(column, value)
  )
  // Whether a handler exists decides what a row renders, so that much does
  // reach the rows; the handlers themselves never change.
  const hasInspect = !!onInspectRow
  const hasForeignKeys = !!onOpenForeignKey
  const rowHandlers = React.useMemo<GridRowHandlers>(
    () => ({
      selectCell: handleSelectCell,
      startEditing,
      closeEditor,
      saveCell,
      moveEditing: handleMoveEditing,
      setIsEditorDirty,
      toggleRow,
      inspectRow: hasInspect ? inspectRow : undefined,
      editRow,
      deleteRow,
      openForeignKey: hasForeignKeys ? openForeignKey : undefined
    }),
    [
      handleSelectCell,
      startEditing,
      closeEditor,
      saveCell,
      handleMoveEditing,
      setIsEditorDirty,
      toggleRow,
      hasInspect,
      inspectRow,
      editRow,
      deleteRow,
      hasForeignKeys,
      openForeignKey
    ]
  )

  const frozenSet = React.useMemo(() => new Set(frozenColumns), [frozenColumns])
  const layout = React.useMemo<GridRowLayout>(
    () => ({
      gridId,
      columns,
      cellStyles,
      frozen: frozenSet,
      isAnyFrozen,
      canMutate,
      canEditCells,
      hasActions: canMutate || hasInspect,
      rowOffset,
      fkColumns
    }),
    [
      gridId,
      columns,
      cellStyles,
      frozenSet,
      isAnyFrozen,
      canMutate,
      canEditCells,
      hasInspect,
      rowOffset,
      fkColumns
    ]
  )

  // A single cell is the cursor, not a range: the range fill only shows once
  // the selection has been extended.
  const multiRange = range && !isSingleCell(range) ? range : null

  if (isInitialLoad) {
    return <LoadingState />
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'min-h-0 flex-1 overflow-auto transition-opacity duration-150',
        isLoading && 'pointer-events-none opacity-50',
        resizingColumn && 'cursor-col-resize select-none'
      )}
    >
      <table
        ref={gridRef}
        role="grid"
        aria-label="Table rows"
        aria-multiselectable
        aria-busy={isLoading || undefined}
        aria-rowcount={totalRows != null ? totalRows + 1 : undefined}
        aria-activedescendant={
          cursor ? gridCellId(gridId, cursor.rowIndex, cursor.columnIndex) : undefined
        }
        // Focusable so the grid can own arrow keys and copy. tabIndex 0 rather
        // than -1: reaching the data by keyboard alone should not need a mouse
        // click first.
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          // Keep the cursor while focus moves inside (the inline editor, a FK
          // button); drop it only when the grid as a whole is left.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clearCursor()
        }}
        style={widthVars}
        className="min-w-full border-separate border-spacing-0 text-sm outline-none"
      >
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} role="row" aria-rowindex={1}>
              {headerGroup.headers.map((header) => {
                const isSelect = header.column.id === SELECT_COLUMN_ID
                const isIndex = header.column.id === INDEX_COLUMN_ID
                const isActions = header.column.id === ACTIONS_COLUMN_ID
                const isDataColumn = !isSelect && !isIndex && !isActions
                const isFrozen = isDataColumn && frozenSet.has(header.column.id)
                return (
                  <th
                    key={header.id}
                    role="columnheader"
                    aria-sort={header.column.columnDef.meta?.ariaSort}
                    style={
                      isDataColumn
                        ? cellStyles.get(header.column.id)
                        : isSelect
                          ? SELECT_STYLE
                          : isIndex
                            ? INDEX_STYLE
                            : undefined
                    }
                    // Attio's header: white, hairlines on both axes, no fill.
                    // Every th is bg-surface so rows scrolling under the sticky
                    // header never show through it.
                    className={cn(
                      'h-9 border-b border-border bg-surface text-left text-xs font-medium text-text-muted',
                      isSelect && 'w-9 px-0 text-center',
                      isIndex &&
                        'w-10 border-r border-border px-2 text-right text-[12px] font-normal text-text-subtle',
                      // The leading display columns pin too, or a frozen data
                      // column would slide over them at left: 0.
                      isAnyFrozen && isSelect && 'sticky left-0 z-20',
                      isAnyFrozen && isIndex && 'sticky left-9 z-20',
                      isActions && 'sticky right-0 w-20 px-3',
                      isDataColumn && 'relative border-r border-border p-0',
                      isFrozen && 'sticky z-20'
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {isDataColumn && (
                      <div
                        onMouseDown={(e) => startResize(e, header.column.id)}
                        onDoubleClick={() => resetColumnSize(header.column.id)}
                        title="Drag to resize, double-click to reset"
                        className="group/resize absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize touch-none select-none"
                      >
                        {/* right-0.5 puts the line on the exact pixel the th
                            border-r occupies, so it darkens the divider already
                            there rather than drawing a second one beside it */}
                        <div
                          className={cn(
                            'absolute inset-y-0 right-0.5 w-px transition-colors group-hover/resize:bg-border-strong',
                            resizingColumn === header.column.id && 'bg-accent'
                          )}
                        />
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {tableRows.length === 0 ? (
            <tr role="row">
              <td role="gridcell" colSpan={tableColumns.length} className="px-4 py-16">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-surface-elevated">
                    {hasFilters ? (
                      <IconFilterOff size={20} className="text-text-subtle" />
                    ) : (
                      <IconTable size={20} className="text-text-subtle" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-text">
                    {hasFilters ? 'No rows match the current filters.' : 'This table is empty.'}
                  </p>
                  {hasFilters && onClearFilters && (
                    <Button size="sm" variant="outline" onClick={onClearFilters}>
                      Clear filters
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            tableRows.map((row) => {
              const rowIndex = row.index
              const isInRange =
                multiRange != null &&
                rowIndex >= multiRange.rowStart &&
                rowIndex <= multiRange.rowEnd
              return (
                <GridRow
                  key={row.id}
                  row={row.original}
                  rowIndex={rowIndex}
                  layout={layout}
                  handlers={rowHandlers}
                  isSelected={row.getIsSelected()}
                  isPendingUndo={
                    pendingUndoRow != null &&
                    Object.entries(pendingUndoRow).every(
                      ([key, value]) => row.original[key] === value
                    )
                  }
                  cursorColumn={cursor?.rowIndex === rowIndex ? cursor.columnIndex : -1}
                  rangeStart={isInRange ? multiRange.colStart : -1}
                  rangeEnd={isInRange ? multiRange.colEnd : -1}
                  editingColumnId={editingCell?.rowIndex === rowIndex ? editingCell.columnId : null}
                  isEditorDirty={editingCell?.rowIndex === rowIndex && isEditorDirty}
                  savedColumnId={savedCell?.rowIndex === rowIndex ? savedCell.columnId : null}
                />
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

const NO_FROZEN: string[] = []
const NO_INSERT_TARGET: InsertTarget = { schema: '', table: '', engine: 'postgres' }
const SELECT_STYLE: React.CSSProperties = {
  width: SELECT_COLUMN_WIDTH,
  minWidth: SELECT_COLUMN_WIDTH,
  maxWidth: SELECT_COLUMN_WIDTH
}
const INDEX_STYLE: React.CSSProperties = {
  width: INDEX_COLUMN_WIDTH,
  minWidth: INDEX_COLUMN_WIDTH,
  maxWidth: INDEX_COLUMN_WIDTH
}

declare module '@tanstack/react-table' {
  // TData/TValue must mirror TanStack's ColumnMeta signature for declaration
  // merging, even though this augmentation does not use them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    dataType?: string
    ariaSort?: 'ascending' | 'descending' | 'none'
  }
}

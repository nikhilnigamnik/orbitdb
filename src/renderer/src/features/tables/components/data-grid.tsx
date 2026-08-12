import * as React from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type SortingState
} from '@tanstack/react-table'
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconPencil,
  IconTrash,
  IconKey,
  IconArrowUpRight,
  IconLayoutSidebarRightExpand
} from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { formatColumnType } from '@renderer/lib/column-type'
import { formatCellValue, isBlankString } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { LoadingState } from '@renderer/components/common/loading-state'
import { CellInlineEditor } from './cell-inline-editor'
import { useGridCursor, type CopyFormat } from '../hooks/use-grid-cursor'
import { frozenOffsets, frozenWidth, orderColumns } from '../lib/frozen-columns'
import type { InsertTarget } from '../lib/clipboard-format'
import type { ColumnInfo, SortDirection } from '@renderer/types'

type Row = Record<string, unknown>

interface ForeignKeyTarget {
  schema: string
  table: string
  column: string
}

interface DataGridProps {
  columns: ColumnInfo[]
  rows: Row[]
  orderBy: string | null
  orderDir: SortDirection
  onSort: (column: string) => void
  onEditRow: (row: Row) => void
  onDeleteRow: (row: Row) => void
  /** Opens the read-only record view. Also bound to Space on the cursor row. */
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
}

const SELECT_COLUMN_ID = '__select__'
const INDEX_COLUMN_ID = '__index__'
const ACTIONS_COLUMN_ID = '__actions__'

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
  frozenColumns = [],
  onColumnSizingCommit,
  onCopied,
  onCopyFailed
}: DataGridProps) {
  // Pinned columns move to the front here rather than at the call site, so the
  // cursor and the clipboard both see the order actually on screen.
  const columns = React.useMemo(
    () => orderColumns(unorderedColumns, frozenColumns),
    [unorderedColumns, frozenColumns]
  )

  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({})
  const isControlled = controlledRowSelection !== undefined
  const rowSelection = isControlled ? controlledRowSelection : internalRowSelection
  const setRowSelection = React.useCallback(
    (updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => {
      const next =
        typeof updater === 'function'
          ? (updater as (prev: RowSelectionState) => RowSelectionState)(rowSelection)
          : updater
      if (isControlled) {
        onRowSelectionChange?.(next)
      } else {
        setInternalRowSelection(next)
      }
    },
    [isControlled, onRowSelectionChange, rowSelection]
  )

  React.useEffect(() => {
    if (isControlled) return
    setInternalRowSelection({})
  }, [rows, isControlled])

  const [isEditorDirty, setIsEditorDirty] = React.useState(false)
  const [editingCell, setEditingCell] = React.useState<{
    rowIndex: number
    columnId: string
  } | null>(null)
  const canEditCells = canMutate && !!onEditCell
  // Cell saves patch `rows` in place; this flag keeps the editing session
  // alive across that change so Tab-to-next-cell works.
  const keepEditingOnRowsChange = React.useRef(false)
  React.useEffect(() => {
    if (keepEditingOnRowsChange.current) {
      keepEditingOnRowsChange.current = false
      return
    }
    setEditingCell(null)
    // The flash is keyed by row index; a new row set (sort/page/reload) would
    // make it light up an unrelated cell.
    setSavedCell(null)
  }, [rows])

  const [savedCell, setSavedCell] = React.useState<{ rowIndex: number; columnId: string } | null>(
    null
  )
  const savedFlashTimer = React.useRef<number | null>(null)
  const markSaved = React.useCallback((rowIndex: number, columnId: string) => {
    if (savedFlashTimer.current) window.clearTimeout(savedFlashTimer.current)
    // Drop the class for a frame so re-saving the same cell within the flash
    // window restarts the CSS animation instead of silently continuing it.
    setSavedCell(null)
    requestAnimationFrame(() => {
      setSavedCell({ rowIndex, columnId })
      savedFlashTimer.current = window.setTimeout(() => setSavedCell(null), 900)
    })
  }, [])
  React.useEffect(
    () => () => {
      if (savedFlashTimer.current) window.clearTimeout(savedFlashTimer.current)
    },
    []
  )

  const dataColumnIds = React.useMemo(() => columns.map((c) => c.name), [columns])
  const moveEditing = React.useCallback(
    (rowIndex: number, columnId: string, direction: 'next' | 'prev') => {
      const colIndex = dataColumnIds.indexOf(columnId)
      if (colIndex === -1) {
        setEditingCell(null)
        return
      }
      let nextCol = colIndex + (direction === 'next' ? 1 : -1)
      let nextRow = rowIndex
      if (nextCol >= dataColumnIds.length) {
        nextCol = 0
        nextRow += 1
      } else if (nextCol < 0) {
        nextCol = dataColumnIds.length - 1
        nextRow -= 1
      }
      // At the edge of the loaded rows, stay put rather than ending the session
      // without a signal - the commit already happened either way.
      if (nextRow < 0 || nextRow >= rows.length) return
      setEditingCell({ rowIndex: nextRow, columnId: dataColumnIds[nextCol] })
    },
    [dataColumnIds, rows.length]
  )

  const sorting: SortingState = React.useMemo(
    () => (orderBy ? [{ id: orderBy, desc: orderDir === 'desc' }] : []),
    [orderBy, orderDir]
  )

  const gridRef = React.useRef<HTMLDivElement>(null)
  const {
    cursor,
    selectCell,
    clear: clearCursor,
    isCellInRange,
    handleKeyDown
  } = useGridCursor({
    rows,
    columnIds: dataColumnIds,
    isEditing: editingCell != null,
    onStartEditing: canEditCells
      ? ({ rowIndex, columnIndex }) =>
          setEditingCell({ rowIndex, columnId: dataColumnIds[columnIndex] })
      : undefined,
    insertTarget: insertTarget ?? { schema: '', table: '', engine: 'postgres' },
    onCopied,
    onCopyFailed
  })

  const tableColumns = React.useMemo<ColumnDef<Row>[]>(() => {
    const helper = createColumnHelper<Row>()

    const selectCol = helper.display({
      id: SELECT_COLUMN_ID,
      header: ({ table }) => {
        const allSelected = table.getIsAllRowsSelected()
        const someSelected = table.getIsSomeRowsSelected()
        return (
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
            aria-label="Select all rows"
          />
        )
      },
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      )
    })

    const indexCol = helper.display({
      id: INDEX_COLUMN_ID,
      header: () => '#',
      cell: ({ row }) => row.index + 1 + rowOffset
    })

    const dataCols = columns.map((col) =>
      helper.accessor((row) => row[col.name], {
        id: col.name,
        enableSorting: true,
        header: () => {
          const isActive = orderBy === col.name
          const sortLabel = isActive
            ? orderDir === 'asc'
              ? `Sort ${col.name} descending`
              : `Clear sort on ${col.name}`
            : `Sort by ${col.name}`
          return (
            <div
              aria-sort={isActive ? (orderDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={cn(
                'group/header flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors',
                isActive && 'bg-surface-elevated/60'
              )}
            >
              {/* Name left, type right against the sort control: the types line
                  up down the grid instead of sitting at a ragged offset that
                  moves with each name, and the name gets the room left over. */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {col.isPrimaryKey && <IconKey size={10} className="shrink-0 text-text-subtle" />}
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-xs',
                    isActive ? 'font-semibold text-text' : 'font-medium text-text-muted'
                  )}
                >
                  {col.name}
                </span>
                {col.dataType && (
                  // max-w so a long type can never crush the name, which is what
                  // identifies the column.
                  <span
                    className="max-w-[55%] shrink-0 truncate pl-2 font-mono text-[10px] font-normal text-text-subtle"
                    title={col.dataType}
                  >
                    {formatColumnType(col.dataType, col.udtName)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSort(col.name)}
                aria-label={sortLabel}
                className={cn(
                  'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded transition-colors',
                  'hover:bg-surface-elevated',
                  isActive ? 'text-text' : 'text-text-subtle'
                )}
              >
                {isActive ? (
                  orderDir === 'asc' ? (
                    <IconArrowUp size={12} />
                  ) : (
                    <IconArrowDown size={12} />
                  )
                ) : (
                  <IconArrowsSort
                    size={12}
                    className="opacity-40 transition-opacity group-hover/header:opacity-100"
                  />
                )}
              </button>
            </div>
          )
        },
        cell: (info) => {
          const value = info.getValue()
          const display = formatCellValue(value, col.udtName)
          if (value === null) {
            return <span className="italic text-text-subtle">NULL</span>
          }
          // '' and '   ' both render as an empty cell otherwise, with no way to
          // tell which one is failing to match a comparison.
          if (isBlankString(value)) {
            return <span className="italic text-text-subtle">{`'${value}'`}</span>
          }
          const fkTarget = fkColumns?.get(col.name)
          if (fkTarget && onOpenForeignKey) {
            return (
              <span className="flex max-w-full items-center gap-1">
                <span className="truncate text-accent-text">{display}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenForeignKey(col.name, value)
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="shrink-0 cursor-pointer rounded p-0.5 text-accent-text opacity-0 transition-opacity hover:bg-accent/15 focus-visible:opacity-100 group-hover:opacity-100"
                  title={`Go to ${fkTarget.schema}.${fkTarget.table}.${fkTarget.column}`}
                  aria-label={`Go to ${fkTarget.schema}.${fkTarget.table}.${fkTarget.column}`}
                >
                  <IconArrowUpRight size={11} />
                </button>
              </span>
            )
          }
          return <span className="text-text">{display}</span>
        },
        meta: { dataType: col.dataType }
      })
    )

    const cols: ColumnDef<Row>[] = [selectCol, indexCol, ...dataCols]
    if (canMutate || onInspectRow) {
      cols.push(
        helper.display({
          id: ACTIONS_COLUMN_ID,
          header: () => null,
          cell: ({ row }) => (
            <div className="flex justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              {onInspectRow && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-text-muted hover:border-transparent hover:bg-text-muted/15 hover:text-text-muted hover:ring-1 hover:ring-inset hover:ring-text-muted/25"
                  onClick={(e) => {
                    e.stopPropagation()
                    onInspectRow(row.original)
                  }}
                  title="View record"
                >
                  <IconLayoutSidebarRightExpand stroke={2} />
                </Button>
              )}
              {canMutate && (
                <>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-text-muted hover:border-transparent hover:bg-text-muted/15 hover:text-text-muted hover:ring-1 hover:ring-inset hover:ring-text-muted/25"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditRow(row.original)
                    }}
                    title="Edit row"
                  >
                    <IconPencil stroke={2} />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-text-muted hover:border-transparent hover:bg-danger/15 hover:text-danger hover:ring-1 hover:ring-inset hover:ring-danger/25"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteRow(row.original)
                    }}
                    title="Delete row"
                  >
                    <IconTrash stroke={2} />
                  </Button>
                </>
              )}
            </div>
          )
        })
      )
    }
    return cols
  }, [
    columns,
    canMutate,
    orderBy,
    orderDir,
    onSort,
    onEditRow,
    onDeleteRow,
    onInspectRow,
    rowOffset,
    fkColumns,
    onOpenForeignKey
  ])

  // Controlled rather than left to TanStack, because the widths are restored
  // from the saved view and handed back to it when a drag ends.
  const [columnSizing, setColumnSizing] = React.useState<Record<string, number>>(
    savedColumnSizing ?? {}
  )
  React.useEffect(() => {
    setColumnSizing(savedColumnSizing ?? {})
  }, [savedColumnSizing])

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

  // Columns stay auto-sized until the user drags a header edge; only then is
  // an explicit width pinned. Double-clicking the handle clears it back to auto.
  // The drag is driven manually (not header.getResizeHandler()) because TanStack
  // starts from its 150px default size, which makes auto-sized columns jump.
  const udtByColumn = React.useMemo(
    () => new Map(columns.map((c) => [c.name, c.udtName])),
    [columns]
  )

  const resizedWidth = React.useCallback(
    (columnId: string): number | undefined => columnSizing[columnId],
    [columnSizing]
  )

  const stickyOffsets = React.useMemo(
    () => frozenOffsets(frozenColumns, columnSizing),
    [frozenColumns, columnSizing]
  )
  const isAnyFrozen = frozenColumns.length > 0
  /** A frozen column is always explicitly sized - the offsets depend on it. */
  const stickyStyle = React.useCallback(
    (columnId: string): React.CSSProperties | undefined => {
      const left = stickyOffsets.get(columnId)
      if (left === undefined) return undefined
      const width = frozenWidth(columnId, columnSizing)
      return { left, width, minWidth: width, maxWidth: width }
    },
    [stickyOffsets, columnSizing]
  )
  const [resizingColumn, setResizingColumn] = React.useState<string | null>(null)
  const startResize = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>, columnId: string) => {
      e.preventDefault()
      const th = e.currentTarget.closest('th')
      if (!th) return
      const startWidth = th.getBoundingClientRect().width
      const startX = e.clientX
      setResizingColumn(columnId)
      // The committed value is read off the table rather than tracked here:
      // onMove runs on a stale closure over whatever sizing existed at mousedown.
      let latest: Record<string, number> = table.getState().columnSizing
      const onMove = (ev: MouseEvent): void => {
        const width = Math.min(1200, Math.max(64, startWidth + ev.clientX - startX))
        table.setColumnSizing((prev) => {
          latest = { ...prev, [columnId]: width }
          return latest
        })
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setResizingColumn(null)
        // Once, at the end. Committing per frame would write to storage on
        // every mousemove of the drag.
        onColumnSizingCommit?.(latest)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [table, onColumnSizingCommit]
  )
  const resetColumnSize = React.useCallback(
    (columnId: string) => {
      table.setColumnSizing((prev) => {
        const next = { ...prev }
        delete next[columnId]
        onColumnSizingCommit?.(next)
        return next
      })
    },
    [table, onColumnSizingCommit]
  )

  const visibleColCount = tableColumns.length

  if (isInitialLoad) {
    return <LoadingState />
  }

  return (
    <div
      ref={gridRef}
      // Focusable so the grid can own arrow keys and copy. tabIndex 0 rather
      // than -1: reaching the data by keyboard alone should not need a mouse
      // click first.
      tabIndex={0}
      role="grid"
      aria-label="Table rows"
      onKeyDown={handleKeyDown}
      onBlur={(e) => {
        // Keep the cursor while focus moves inside (the inline editor, a FK
        // button); drop it only when the grid as a whole is left.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clearCursor()
      }}
      className={cn(
        'min-h-0 flex-1 overflow-auto transition-opacity duration-150 outline-none',
        isLoading && 'pointer-events-none opacity-50',
        resizingColumn && 'cursor-col-resize select-none'
      )}
    >
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const isSelect = header.column.id === SELECT_COLUMN_ID
                const isIndex = header.column.id === INDEX_COLUMN_ID
                const isActions = header.column.id === ACTIONS_COLUMN_ID
                const isDataColumn = !isSelect && !isIndex && !isActions
                const width = isDataColumn ? resizedWidth(header.column.id) : undefined
                const sticky = isDataColumn ? stickyStyle(header.column.id) : undefined
                return (
                  <th
                    key={header.id}
                    style={
                      sticky ??
                      (width !== undefined
                        ? { width, minWidth: width, maxWidth: width }
                        : undefined)
                    }
                    className={cn(
                      'border-b border-border bg-surface text-left font-medium',
                      isSelect && 'w-9 px-2 py-2',
                      isIndex &&
                        'w-10 border-r border-r-border/40 px-3 py-2 text-xs text-text-subtle',
                      // The leading display columns pin too, or a frozen data
                      // column would slide over them at left: 0.
                      isAnyFrozen && isSelect && 'sticky left-0 z-20',
                      isAnyFrozen && isIndex && 'sticky left-9 z-20',
                      isActions && 'sticky right-0 w-20 px-3 py-2',
                      isDataColumn && 'relative p-0 text-xs text-text-muted',
                      sticky && 'sticky z-20 border-r border-r-border'
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
                        className="absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize touch-none select-none"
                      >
                        {/* right-0.5 puts the line on the exact pixel the td
                            border-r occupies, so header and body dividers align */}
                        <div className="absolute inset-y-0 right-0.5 w-px bg-border/40" />
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={visibleColCount}
                className="px-3 py-10 text-center text-xs text-text-subtle"
              >
                {hasFilters ? (
                  <span className="inline-flex items-center gap-2">
                    No rows match the current filters.
                    {onClearFilters && (
                      <button
                        type="button"
                        onClick={onClearFilters}
                        className="cursor-pointer rounded-md border border-text-muted/15 bg-text-muted/8 px-2 py-0.5 text-text-muted transition-colors hover:bg-text-muted/15 hover:text-text"
                      >
                        Clear filters
                      </button>
                    )}
                  </span>
                ) : (
                  'This table is empty.'
                )}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => {
              const isSelected = row.getIsSelected()
              const isPendingUndo =
                pendingUndoRow != null &&
                Object.entries(pendingUndoRow).every(([key, value]) => row.original[key] === value)
              return (
                <tr
                  key={row.id}
                  className={cn(
                    // transition-colors would animate outline-color from currentColor
                    // (white) on select - only transition the background
                    'group cursor-default transition-[background-color]',
                    isSelected
                      ? // tr can't render Tailwind ring (box-shadow); outline works in Chromium
                        'bg-surface-elevated/70 outline outline-border-strong -outline-offset-1'
                      : isPendingUndo
                        ? // Points at the row the undo prompt is about: a
                          // truncated key could never identify it, and the row is
                          // on screen anyway.
                          'bg-accent/8 outline outline-accent/40 -outline-offset-1'
                        : 'hover:bg-surface-elevated/40'
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isSelect = cell.column.id === SELECT_COLUMN_ID
                    const isIndex = cell.column.id === INDEX_COLUMN_ID
                    const isActions = cell.column.id === ACTIONS_COLUMN_ID
                    const isData = !isSelect && !isIndex && !isActions
                    const isEditingThis =
                      isData &&
                      editingCell?.rowIndex === row.index &&
                      editingCell?.columnId === cell.column.id
                    const editColumn = isEditingThis
                      ? columns.find((c) => c.name === cell.column.id)
                      : undefined
                    const udtName = isData ? udtByColumn.get(cell.column.id) : undefined
                    const cellValue = row.original[cell.column.id]
                    const isSavedFlash =
                      isData &&
                      savedCell?.rowIndex === row.index &&
                      savedCell?.columnId === cell.column.id
                    const width = isData ? resizedWidth(cell.column.id) : undefined
                    const sticky = isData ? stickyStyle(cell.column.id) : undefined
                    const dataColumnIndex = isData ? dataColumnIds.indexOf(cell.column.id) : -1
                    const isCursor =
                      isData &&
                      cursor?.rowIndex === row.index &&
                      cursor?.columnIndex === dataColumnIndex
                    const isRangeCell = isData && isCellInRange(row.index, dataColumnIndex)
                    return (
                      <td
                        key={cell.id}
                        aria-selected={isCursor || isRangeCell || undefined}
                        style={
                          sticky ??
                          (width !== undefined
                            ? { width, minWidth: width, maxWidth: width }
                            : undefined)
                        }
                        className={cn(
                          'border-b border-border/60 px-3 py-1.5',
                          isSelect && 'px-2',
                          (isIndex || isData) && 'border-r border-r-border/40',
                          isIndex && 'text-xs text-text-subtle',
                          isActions && 'sticky right-0 bg-surface px-2 py-1 group-hover:bg-surface',
                          // Opaque, or the scrolling columns show through. Same
                          // trade as the actions column: the row tint stops here.
                          isAnyFrozen && isSelect && 'sticky left-0 z-10 bg-surface',
                          isAnyFrozen && isIndex && 'sticky left-9 z-10 bg-surface',
                          sticky && 'sticky z-10 border-r border-r-border bg-surface',
                          isData && 'max-w-xs truncate font-mono text-xs',
                          isData && canEditCells && 'cursor-text',
                          // Range fill first, so the cursor's own ring wins on the
                          // cell that has both.
                          isRangeCell && !isEditingThis && 'bg-accent/8',
                          isCursor && !isEditingThis && 'ring-1 ring-inset ring-accent-text/70',
                          isEditingThis && 'bg-accent/10 ring-1 ring-inset',
                          isEditingThis && (isEditorDirty ? 'ring-accent' : 'ring-accent-text/50'),
                          isSavedFlash && 'animate-cell-saved'
                        )}
                        title={
                          isData && !isEditingThis ? formatCellValue(cellValue, udtName) : undefined
                        }
                        onMouseDown={
                          // While the editor popover is open its portal events bubble
                          // through this td in the React tree - skip the handler so
                          // double-click text selection inside the editor still works.
                          isData && !isEditingThis
                            ? (e) => {
                                // Stop the browser's double-click word-selection (the
                                // highlight) while keeping single-click selection intact.
                                if (canEditCells && e.detail > 1) e.preventDefault()
                                selectCell(row.index, dataColumnIndex, e.shiftKey)
                                // preventDefault above can cost the container its
                                // focus, and without focus the arrow keys go nowhere.
                                if (!editingCell) gridRef.current?.focus()
                              }
                            : undefined
                        }
                        onDoubleClick={
                          isData && canEditCells && !isEditingThis
                            ? () =>
                                setEditingCell({ rowIndex: row.index, columnId: cell.column.id })
                            : undefined
                        }
                      >
                        {isEditingThis && editColumn && onEditCell ? (
                          <CellInlineEditor
                            column={editColumn}
                            value={cellValue}
                            onSave={async (newValue) => {
                              keepEditingOnRowsChange.current = true
                              try {
                                await onEditCell(row.original, cell.column.id, newValue)
                              } catch (err) {
                                keepEditingOnRowsChange.current = false
                                throw err
                              }
                              markSaved(row.index, cell.column.id)
                            }}
                            onClose={() => setEditingCell(null)}
                            onNavigate={(direction) =>
                              moveEditing(row.index, cell.column.id, direction)
                            }
                            onDirtyChange={setIsEditorDirty}
                          />
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

declare module '@tanstack/react-table' {
  // TData/TValue must mirror TanStack's ColumnMeta signature for declaration
  // merging, even though this augmentation only adds `dataType`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    dataType?: string
  }
}

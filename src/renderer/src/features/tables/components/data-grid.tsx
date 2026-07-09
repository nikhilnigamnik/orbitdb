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
  IconArrowUpRight
} from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { formatCellValue } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { LoadingState } from '@renderer/components/common/loading-state'
import { CellEditPopover } from './cell-edit-popover'
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
  onEditCell?: (row: Row, column: string, value: unknown) => Promise<void>
  canMutate: boolean
  rowOffset?: number
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (selection: RowSelectionState) => void
  isLoading?: boolean
  isInitialLoad?: boolean
  fkColumns?: Map<string, ForeignKeyTarget>
  onOpenForeignKey?: (column: string, value: unknown) => void
}

const SELECT_COLUMN_ID = '__select__'
const INDEX_COLUMN_ID = '__index__'
const ACTIONS_COLUMN_ID = '__actions__'

export function DataGrid({
  columns,
  rows,
  orderBy,
  orderDir,
  onSort,
  onEditRow,
  onDeleteRow,
  onEditCell,
  canMutate,
  rowOffset = 0,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
  isLoading = false,
  isInitialLoad = false,
  fkColumns,
  onOpenForeignKey
}: DataGridProps) {
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
      if (nextRow < 0 || nextRow >= rows.length) {
        setEditingCell(null)
        return
      }
      setEditingCell({ rowIndex: nextRow, columnId: dataColumnIds[nextCol] })
    },
    [dataColumnIds, rows.length]
  )

  const sorting: SortingState = React.useMemo(
    () => (orderBy ? [{ id: orderBy, desc: orderDir === 'desc' }] : []),
    [orderBy, orderDir]
  )

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
              <div className="flex min-w-0 items-center gap-1.5">
                {col.isPrimaryKey && <IconKey size={10} className="shrink-0 text-text-subtle" />}
                <div className="flex min-w-0 flex-col leading-tight">
                  <span
                    className={cn(
                      'truncate text-[11.5px]',
                      isActive ? 'font-semibold text-text' : 'font-medium text-text-muted'
                    )}
                  >
                    {col.name}
                  </span>
                  {col.dataType && (
                    <span className="truncate font-mono text-[10px] font-normal text-text-subtle">
                      {col.dataType}
                    </span>
                  )}
                </div>
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
          const display = formatCellValue(value)
          if (value === null) {
            return <span className="italic text-text-subtle">NULL</span>
          }
          const fkTarget = fkColumns?.get(col.name)
          if (fkTarget && onOpenForeignKey) {
            return (
              <span className="flex max-w-full items-center gap-1">
                <span className="truncate text-accent">{display}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenForeignKey(col.name, value)
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="shrink-0 cursor-pointer rounded p-0.5 text-accent opacity-0 transition-opacity hover:bg-accent/15 group-hover:opacity-100"
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
    if (canMutate) {
      cols.push(
        helper.display({
          id: ACTIONS_COLUMN_ID,
          header: () => null,
          cell: ({ row }) => (
            <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-text-muted hover:border-transparent hover:bg-linear-to-b hover:from-neutral-500/25 hover:to-neutral-500/5 hover:text-neutral-200 hover:ring-1 hover:ring-inset hover:ring-neutral-500/25 hover:shadow-[inset_0_1px_0_rgba(229,229,229,0.25)]"
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
                className="text-text-muted hover:border-transparent hover:bg-linear-to-b hover:from-rose-500/25 hover:to-rose-500/5 hover:text-rose-200 hover:ring-1 hover:ring-inset hover:ring-rose-500/25 hover:shadow-[inset_0_1px_0_rgba(253,164,175,0.35)]"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteRow(row.original)
                }}
                title="Delete row"
              >
                <IconTrash stroke={2} />
              </Button>
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
    rowOffset,
    fkColumns,
    onOpenForeignKey
  ])

  const table = useReactTable<Row>({
    data: rows,
    columns: tableColumns,
    state: { sorting, rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel()
  })

  const visibleColCount = tableColumns.length

  if (isInitialLoad) {
    return <LoadingState />
  }

  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-auto transition-opacity duration-150',
        isLoading && 'pointer-events-none opacity-50'
      )}
    >
      <table className="min-w-full border-separate border-spacing-0 text-[12.5px]">
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const isSelect = header.column.id === SELECT_COLUMN_ID
                const isIndex = header.column.id === INDEX_COLUMN_ID
                const isActions = header.column.id === ACTIONS_COLUMN_ID
                const isDataColumn = !isSelect && !isIndex && !isActions
                return (
                  <th
                    key={header.id}
                    className={cn(
                      'border-b border-border bg-surface text-left font-medium',
                      isSelect && 'w-9 px-2 py-2',
                      isIndex && 'w-10 px-3 py-2 text-[10.5px] text-text-subtle',
                      isActions && 'sticky right-0 w-20 px-3 py-2',
                      isDataColumn && 'p-0 text-[11.5px] text-text-muted'
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
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
                className="px-3 py-10 text-center text-[12.5px] text-text-subtle"
              >
                No rows.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => {
              const isSelected = row.getIsSelected()
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'group cursor-default transition-colors',
                    isSelected ? 'bg-surface-elevated/70' : 'hover:bg-surface-elevated/40'
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
                    const cellValue = row.original[cell.column.id]
                    const isSavedFlash =
                      isData &&
                      savedCell?.rowIndex === row.index &&
                      savedCell?.columnId === cell.column.id
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'border-b border-border/60 px-3 py-1.5',
                          isSelect && 'px-2',
                          isIndex && 'text-[10.5px] text-text-subtle',
                          isActions && 'sticky right-0 bg-surface px-2 py-1 group-hover:bg-surface',
                          isData && 'max-w-xs truncate font-mono text-[11.5px]',
                          isData && canEditCells && 'cursor-text',
                          isEditingThis && 'bg-accent/10 ring-1 ring-inset ring-accent/50',
                          isSavedFlash && 'animate-cell-saved'
                        )}
                        title={isData && !isEditingThis ? formatCellValue(cellValue) : undefined}
                        onMouseDown={
                          // While the editor popover is open its portal events bubble
                          // through this td in the React tree — skip the handler so
                          // double-click text selection inside the editor still works.
                          isData && canEditCells && !isEditingThis
                            ? (e) => {
                                // Stop the browser's double-click word-selection (the
                                // highlight) while keeping single-click selection intact.
                                if (e.detail > 1) e.preventDefault()
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
                          <CellEditPopover
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
                          >
                            <span className="block max-w-full truncate">
                              {cellValue === null ? (
                                <span className="italic text-text-subtle">NULL</span>
                              ) : (
                                formatCellValue(cellValue)
                              )}
                            </span>
                          </CellEditPopover>
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

import * as React from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState
} from '@tanstack/react-table'
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconLoader,
  IconPencil,
  IconTrash,
  IconKey,
  IconArrowUpRight
} from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { formatCellValue } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { CellPreview } from './cell-preview'
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
  canMutate: boolean
  rowOffset?: number
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (selection: RowSelectionState) => void
  isLoading?: boolean
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
  canMutate,
  rowOffset = 0,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
  isLoading = false,
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
              aria-sort={
                isActive ? (orderDir === 'asc' ? 'ascending' : 'descending') : 'none'
              }
              className={cn(
                'group/header flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors',
                isActive && 'bg-surface-elevated/60'
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {col.isPrimaryKey && (
                  <IconKey size={10} className="shrink-0 text-text-subtle" />
                )}
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenForeignKey(col.name, value)
                }}
                className="group/fk inline-flex max-w-full cursor-pointer items-center gap-1 truncate rounded text-accent transition-colors hover:text-accent/80 hover:underline"
                title={`Go to ${fkTarget.schema}.${fkTarget.table}.${fkTarget.column}`}
              >
                <span className="truncate">{display}</span>
                <IconArrowUpRight
                  size={10}
                  className="shrink-0 opacity-0 transition-opacity group-hover/fk:opacity-100"
                />
              </button>
            )
          }
          return (
            <CellPreview value={value} display={display}>
              <span className="text-text">{display}</span>
            </CellPreview>
          )
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
                className="text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditRow(row.original)
                }}
                title="Edit row"
              >
                <IconPencil size={11} />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-text-muted hover:bg-red-500/10 hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteRow(row.original)
                }}
                title="Delete row"
              >
                <IconTrash size={11} />
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

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-text-subtle">
        <IconLoader stroke={2} size={22} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
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
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'border-b border-border/60 px-3 py-1.5',
                          isSelect && 'px-2',
                          isIndex && 'text-[10.5px] text-text-subtle',
                          isActions && 'sticky right-0 bg-surface px-2 py-1 group-hover:bg-surface',
                          !isSelect &&
                            !isIndex &&
                            !isActions &&
                            'max-w-xs truncate font-mono text-[11.5px]'
                        )}
                        title={
                          !isSelect && !isIndex && !isActions
                            ? formatCellValue(row.original[cell.column.id])
                            : undefined
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
  interface ColumnMeta<TData extends unknown, TValue> {
    dataType?: string
  }
}

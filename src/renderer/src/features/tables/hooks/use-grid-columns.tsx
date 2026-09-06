/**
 * The TanStack column definitions: the checkbox, the row number, one per data
 * column, and the row actions.
 *
 * Out of the component because it is the largest single thing in it and depends
 * only on its inputs - none of the grid's own state reaches in here.
 */

import * as React from 'react'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
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
import type { ColumnInfo, SortDirection } from '@renderer/types'
import {
  ACTIONS_COLUMN_ID,
  INDEX_COLUMN_ID,
  SELECT_COLUMN_ID,
  type ForeignKeyTarget,
  type Row
} from '../lib/grid-types'

interface GridColumnsOptions {
  columns: ColumnInfo[]
  canMutate: boolean
  orderBy: string | null
  orderDir: SortDirection
  onSort: (column: string) => void
  onEditRow: (row: Row) => void
  onDeleteRow: (row: Row) => void
  onInspectRow?: (row: Row) => void
  rowOffset: number
  fkColumns?: Map<string, ForeignKeyTarget>
  onOpenForeignKey?: (column: string, value: unknown) => void
}

export function useGridColumns({
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
}: GridColumnsOptions): ColumnDef<Row>[] {
  return React.useMemo<ColumnDef<Row>[]>(() => {
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
}

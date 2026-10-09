/**
 * The TanStack column definitions: the checkbox, the row number, one per data
 * column, and the row actions.
 *
 * Headers only. The body cells are drawn by `GridRow`, which needs per-row
 * inputs (the cursor, the tab stop) that a column definition cannot see, and
 * which must not rebuild every cell when one row's selection changes.
 */

import * as React from 'react'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { formatColumnType } from '@renderer/lib/column-type'
import { Checkbox } from '@renderer/components/ui/checkbox'
import type { ColumnInfo, SortDirection } from '@renderer/types'
import { ACTIONS_COLUMN_ID, INDEX_COLUMN_ID, SELECT_COLUMN_ID, type Row } from '../lib/grid-types'
import { ColumnTypeIcon } from '../components/column-type-icon'

interface GridColumnsOptions {
  columns: ColumnInfo[]
  orderBy: string | null
  orderDir: SortDirection
  onSort: (column: string) => void
  hasActions: boolean
}

export function useGridColumns({
  columns,
  orderBy,
  orderDir,
  onSort,
  hasActions
}: GridColumnsOptions): ColumnDef<Row>[] {
  return React.useMemo<ColumnDef<Row>[]>(() => {
    const helper = createColumnHelper<Row>()

    const selectCol = helper.display({
      id: SELECT_COLUMN_ID,
      header: ({ table }) => {
        const allSelected = table.getIsAllRowsSelected()
        const someSelected = table.getIsSomeRowsSelected()
        return (
          // mx-auto, not the cell's text-center: the checkbox is a block-level
          // flex box, which text-center does not move, so it hugged the left edge.
          <Checkbox
            className="mx-auto"
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
            aria-label="Select all rows"
          />
        )
      }
    })

    const indexCol = helper.display({
      id: INDEX_COLUMN_ID,
      header: () => '#'
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
            <div className="group/header flex h-9 w-full items-center justify-between gap-1.5 px-3 text-left">
              {/* Led by a type icon, as Attio's headers are. Name left, type
                  right against the sort control: the types line up down the grid
                  instead of sitting at a ragged offset that moves with each
                  name, and the name gets the room left over. */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <ColumnTypeIcon column={col} />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-xs font-medium',
                    isActive ? 'text-text' : 'text-text-muted'
                  )}
                >
                  {col.name}
                </span>
                {col.dataType && (
                  // max-w so a long type can never crush the name, which is what
                  // identifies the column.
                  <span
                    className="max-w-[55%] shrink-0 truncate pl-2 text-[12px] font-normal text-text-subtle"
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
                  'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors',
                  'hover:bg-surface-elevated hover:text-text',
                  isActive ? 'text-text' : 'text-text-subtle'
                )}
              >
                {isActive ? (
                  orderDir === 'asc' ? (
                    <IconArrowUp size={14} />
                  ) : (
                    <IconArrowDown size={14} />
                  )
                ) : (
                  <IconArrowsSort
                    size={14}
                    className="opacity-0 transition-opacity group-focus-within/header:opacity-100 group-hover/header:opacity-100"
                  />
                )}
              </button>
            </div>
          )
        },
        // Read by the th: aria-sort only counts on the header cell itself.
        meta: {
          dataType: col.dataType,
          ariaSort:
            orderBy === col.name ? (orderDir === 'asc' ? 'ascending' : 'descending') : 'none'
        }
      })
    )

    const cols: ColumnDef<Row>[] = [selectCol, indexCol, ...dataCols]
    if (hasActions) cols.push(helper.display({ id: ACTIONS_COLUMN_ID, header: () => null }))
    return cols
  }, [columns, orderBy, orderDir, onSort, hasActions])
}

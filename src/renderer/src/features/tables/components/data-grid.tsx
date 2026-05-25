import * as React from 'react'
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconPencil,
  IconTrash,
  IconKey
} from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { formatCellValue } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import type { ColumnInfo, SortDirection } from '@renderer/types'

interface DataGridProps {
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
  orderBy: string | null
  orderDir: SortDirection
  onSort: (column: string) => void
  onEditRow: (row: Record<string, unknown>) => void
  onDeleteRow: (row: Record<string, unknown>) => void
  canMutate: boolean
}

export function DataGrid({
  columns,
  rows,
  orderBy,
  orderDir,
  onSort,
  onEditRow,
  onDeleteRow,
  canMutate
}: DataGridProps) {
  const [selected, setSelected] = React.useState<number | null>(null)

  return (
    <div className="flex-1 overflow-auto">
      <table className="min-w-full border-separate border-spacing-0 text-[12.5px]">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="w-10 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-left text-[10.5px] font-medium text-[var(--color-text-subtle)]">
              #
            </th>
            {columns.map((col) => {
              const isSorted = orderBy === col.name
              return (
                <th
                  key={col.name}
                  className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-left text-[11.5px] font-medium text-[var(--color-text-muted)]"
                >
                  <button
                    onClick={() => onSort(col.name)}
                    className="group flex items-center gap-1.5 text-[var(--color-text)] hover:text-[var(--color-text)]"
                  >
                    <span className="truncate">{col.name}</span>
                    {col.isPrimaryKey && (
                      <IconKey size={10} className="text-[var(--color-text-subtle)]" />
                    )}
                    <span className="text-[var(--color-text-subtle)]">
                      {isSorted ? (
                        orderDir === 'asc' ? (
                          <IconArrowUp size={11} />
                        ) : (
                          <IconArrowDown size={11} />
                        )
                      ) : (
                        <IconArrowsSort size={11} className="opacity-0 group-hover:opacity-100" />
                      )}
                    </span>
                  </button>
                  <div className="mt-0.5 font-mono text-[10px] font-normal text-[var(--color-text-subtle)]">
                    {col.dataType}
                  </div>
                </th>
              )
            })}
            {canMutate && (
              <th className="sticky right-0 w-20 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (canMutate ? 2 : 1)}
                className="px-3 py-10 text-center text-[12.5px] text-[var(--color-text-subtle)]"
              >
                No rows.
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={() => setSelected(rowIndex)}
                className={cn(
                  'group cursor-default transition-colors',
                  selected === rowIndex
                    ? 'bg-[var(--color-surface-elevated)]/60'
                    : 'hover:bg-[var(--color-surface)]/60'
                )}
              >
                <td className="border-b border-[var(--color-border)]/60 px-3 py-1.5 text-[10.5px] text-[var(--color-text-subtle)]">
                  {rowIndex + 1}
                </td>
                {columns.map((col) => {
                  const value = row[col.name]
                  const isNull = value === null
                  const display = formatCellValue(value)
                  return (
                    <td
                      key={col.name}
                      className="max-w-xs truncate border-b border-[var(--color-border)]/60 px-3 py-1.5 font-mono text-[11.5px]"
                      title={display}
                    >
                      {isNull ? (
                        <span className="italic text-[var(--color-text-subtle)]">NULL</span>
                      ) : (
                        <span className="text-[var(--color-text)]">{display}</span>
                      )}
                    </td>
                  )
                })}
                {canMutate && (
                  <td className="sticky right-0 border-b border-[var(--color-border)]/60 bg-[var(--color-bg)] px-2 py-1 group-hover:bg-[var(--color-surface)]">
                    <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditRow(row)
                        }}
                        title="Edit row"
                      >
                        <IconPencil size={11} />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteRow(row)
                        }}
                        title="Delete row"
                      >
                        <IconTrash size={11} />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

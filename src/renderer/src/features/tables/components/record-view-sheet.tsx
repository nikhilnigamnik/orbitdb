import * as React from 'react'
import { IconArrowUpRight, IconCopy, IconPencil } from '@tabler/icons-react'
import { Sheet } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { formatColumnType } from '@renderer/lib/column-type'
import { formatCellValue, isBlankString } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import type { ColumnInfo, ForeignKeyInfo } from '@renderer/types'
import { ReferencedBy } from './referenced-by'
import { toJsonText } from '../lib/clipboard-format'

interface ForeignKeyTarget {
  schema: string
  table: string
  column: string
}

interface RecordViewSheetProps {
  isOpen: boolean
  onClose: () => void
  connectionId: string
  schema: string
  table: string
  columns: ColumnInfo[]
  row: Record<string, unknown> | null
  foreignKeys: ForeignKeyInfo[]
  onOpenForeignKey: (column: string, value: unknown) => void
  /** Absent on a view, or a table with no primary key. */
  onEdit?: (row: Record<string, unknown>) => void
  onCopied?: (label: string) => void
  onCopyFailed?: (error: unknown) => void
}

/**
 * One row read top to bottom.
 *
 * The edit sheet already lays a row out vertically, but it is a form: every
 * value is in an input, nothing is selectable as text, and the relationships
 * are only visible once you know to scroll. This is the reading version - the
 * answer to "what is this record", where the grid answers "which records".
 */
export function RecordViewSheet({
  isOpen,
  onClose,
  connectionId,
  schema,
  table,
  columns,
  row,
  foreignKeys,
  onOpenForeignKey,
  onEdit,
  onCopied,
  onCopyFailed
}: RecordViewSheetProps) {
  const fkByColumn = React.useMemo(() => {
    const map = new Map<string, ForeignKeyTarget>()
    for (const fk of foreignKeys) {
      if (fk.columns.length !== 1 || fk.referencedColumns.length !== 1) continue
      map.set(fk.columns[0], {
        schema: fk.referencedSchema,
        table: fk.referencedTable,
        column: fk.referencedColumns[0]
      })
    }
    return map
  }, [foreignKeys])

  async function copyRow() {
    if (!row) return
    try {
      await navigator.clipboard.writeText(
        toJsonText(
          [row],
          columns.map((c) => c.name)
        )
      )
      onCopied?.('JSON')
    } catch (err) {
      onCopyFailed?.(err)
    }
  }

  return (
    <Sheet
      openSheet={isOpen}
      setOpenSheet={(open) => {
        if (!open) onClose()
      }}
      side="right"
      sheetContentClassName="sm:max-w-xl bg-surface"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3 pr-12">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-xs font-semibold text-text">Record</h2>
              <p className="truncate font-mono text-xs text-text-subtle">
                {schema}.{table}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={() => void copyRow()}
                disabled={!row}
              >
                <IconCopy size={12} />
                Copy
              </Button>
              {onEdit && row && (
                <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>
                  <IconPencil size={12} />
                  Edit
                </Button>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4">
            {row && (
              <div className="overflow-hidden rounded-lg border border-border">
                <dl className="divide-y divide-border/60">
                  {columns.map((column) => (
                    <Field
                      key={column.name}
                      column={column}
                      value={row[column.name]}
                      target={fkByColumn.get(column.name)}
                      onFollow={() => onOpenForeignKey(column.name, row[column.name])}
                    />
                  ))}
                </dl>
              </div>
            )}

            {row && (
              <ReferencedBy
                connectionId={connectionId}
                schema={schema}
                table={table}
                row={row}
                onNavigate={onClose}
              />
            )}
          </div>
        </div>
      }
    />
  )
}

function Field({
  column,
  value,
  target,
  onFollow
}: {
  column: ColumnInfo
  value: unknown
  target?: ForeignKeyTarget
  onFollow: () => void
}) {
  const display = formatCellValue(value, column.udtName)
  const isNull = value === null || value === undefined
  const isBlank = !isNull && isBlankString(value)

  return (
    <div className="grid grid-cols-[10rem_1fr] items-start gap-3 px-3 py-2">
      <dt className="flex min-w-0 items-center gap-1.5 pt-0.5">
        <span className="truncate font-mono text-xs text-text-muted" title={column.name}>
          {column.name}
        </span>
        {column.isPrimaryKey && <Chip tone="emerald">PK</Chip>}
      </dt>
      <dd className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-start gap-1.5">
          {/* Wrapping, not truncating: the whole point of this view is to show
              the value a grid cell had to cut off. */}
          <span
            className={cn(
              'min-w-0 flex-1 font-mono text-xs break-words whitespace-pre-wrap',
              isNull || isBlank ? 'text-text-subtle italic' : 'text-text'
            )}
          >
            {isNull ? 'NULL' : isBlank ? `'${String(value)}'` : display}
          </span>
          {target && !isNull && (
            <button
              type="button"
              onClick={onFollow}
              title={`Go to ${target.schema}.${target.table}.${target.column}`}
              aria-label={`Go to ${target.schema}.${target.table}.${target.column}`}
              className="mt-0.5 shrink-0 cursor-pointer rounded p-0.5 text-accent-text transition-colors hover:bg-accent/15"
            >
              <IconArrowUpRight size={12} />
            </button>
          )}
        </div>
        <span className="font-mono text-[10px] text-text-subtle">
          {formatColumnType(column.dataType, column.udtName)}
        </span>
      </dd>
    </div>
  )
}

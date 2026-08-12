import * as React from 'react'
import { IconArrowUpRight, IconCopy, IconPencil, IconSearch } from '@tabler/icons-react'
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

/**
 * Below this a filter box costs more than it saves - the eye finds the field
 * faster than the hand reaches the input.
 */
const FILTER_FROM_COLUMNS = 12

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

  const [search, setSearch] = React.useState('')

  // A filter left over from the last record would hide fields in this one.
  React.useEffect(() => setSearch(''), [row])

  const visible = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return columns
    return columns.filter((column) => column.name.toLowerCase().includes(query))
  }, [columns, search])

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      onCopied?.(label)
    } catch (err) {
      onCopyFailed?.(err)
    }
  }

  function copyRow() {
    if (!row) return
    return copy(
      toJsonText(
        [row],
        columns.map((c) => c.name)
      ),
      'JSON'
    )
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
        // `min-h-0 flex-1`, not `h-full`: as a flex child of the sheet, a
        // percentage height leaves the scroll region measuring against the
        // wrong box when the content outgrows it.
        <div className="flex min-h-0 flex-1 flex-col">
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

          {row && columns.length >= FILTER_FROM_COLUMNS && (
            <div className="shrink-0 px-4 pt-3">
              <div className="relative">
                <IconSearch
                  size={12}
                  className="absolute top-1/2 left-2.5 -translate-y-1/2 text-text-subtle"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter fields…"
                  aria-label="Filter fields"
                  className="h-7 w-full rounded-md bg-surface-elevated/40 pr-2 pl-8 font-mono text-xs text-text outline-none placeholder:font-sans placeholder:text-text-subtle"
                />
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4">
            {row && visible.length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-text-subtle">
                No field matches &ldquo;{search}&rdquo;
              </p>
            )}

            {row && visible.length > 0 && (
              // `shrink-0` is what makes this scroll. A flex item whose overflow
              // is not `visible` has an automatic minimum size of zero, so this
              // card was shrinking to fit the viewport and clipping its own rows
              // instead of overflowing and letting the parent scroll.
              <div className="shrink-0 overflow-hidden rounded-lg border border-border">
                <dl className="divide-y divide-border/60">
                  {visible.map((column) => (
                    <Field
                      key={column.name}
                      column={column}
                      value={row[column.name]}
                      target={fkByColumn.get(column.name)}
                      onFollow={() => onOpenForeignKey(column.name, row[column.name])}
                      onCopy={() => copy(toJsonText([row], [column.name]), column.name)}
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
  onFollow,
  onCopy
}: {
  column: ColumnInfo
  value: unknown
  target?: ForeignKeyTarget
  onFollow: () => void
  onCopy: () => void
}) {
  const display = formatCellValue(value, column.udtName)
  const isNull = value === null || value === undefined
  const isBlank = !isNull && isBlankString(value)
  const type = formatColumnType(column.dataType, column.udtName)

  return (
    <div className="group grid grid-cols-[10.5rem_1fr] items-start gap-4 px-3 py-2.5 transition-colors hover:bg-surface-elevated/40">
      {/* The type belongs here, not beside the value: it describes the column.
          Under the value it read as part of the data and cost every field a
          second line. */}
      <dt className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-xs text-text" title={column.name}>
            {column.name}
          </span>
          {column.isPrimaryKey && <Chip tone="emerald">PK</Chip>}
        </span>
        <span className="truncate font-mono text-[10px] text-text-subtle" title={type}>
          {type}
        </span>
      </dt>

      <dd className="flex min-w-0 items-start gap-1.5">
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

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onCopy}
            title={`Copy ${column.name}`}
            aria-label={`Copy ${column.name}`}
            // Revealed on hover: one of these per field, always on, would out-shout
            // the values they belong to. Focus keeps it reachable by keyboard.
            className="cursor-pointer rounded p-1 text-text-subtle opacity-0 transition group-hover:opacity-100 hover:bg-surface hover:text-text focus-visible:opacity-100"
          >
            <IconCopy size={12} />
          </button>
          {target && !isNull && (
            // Named, not a bare arrow: where it goes is the useful part, and a
            // tooltip only tells you after you have already wondered.
            <button
              type="button"
              onClick={onFollow}
              title={`Go to ${target.schema}.${target.table}.${target.column}`}
              aria-label={`Go to ${target.schema}.${target.table}.${target.column}`}
              className="flex max-w-[8rem] cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-accent-text transition-colors hover:bg-accent/15"
            >
              <span className="truncate font-mono text-[10px]">{target.table}</span>
              <IconArrowUpRight size={12} className="shrink-0" />
            </button>
          )}
        </div>
      </dd>
    </div>
  )
}

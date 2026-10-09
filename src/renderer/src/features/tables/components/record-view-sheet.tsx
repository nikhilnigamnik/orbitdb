import * as React from 'react'
import { IconArrowUpRight, IconCopy, IconPencil, IconSearch } from '@tabler/icons-react'
import { Sheet } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Chip } from '@renderer/components/ui/chip'
import { formatColumnType } from '@renderer/lib/column-type'
import { formatCellValue, isBlankString } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import type { ColumnInfo, ForeignKeyInfo } from '@renderer/types'
import { ReferencedBy } from './referenced-by'
import { toJsonText } from '../lib/clipboard-format'
import { isJsonType } from '../lib/cell-value'

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
      title="Record"
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
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 pr-12">
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <h2 className="shrink-0 text-sm font-semibold text-text">Record</h2>
              <p className="truncate text-[12px] text-text-subtle">
                {schema}.{table}
              </p>
            </div>
            <Button
              size="sm"
              variant="subtle"
              className="shrink-0"
              onClick={() => void copyRow()}
              disabled={!row}
            >
              <IconCopy size={14} />
              Copy
            </Button>
          </div>

          {row && columns.length >= FILTER_FROM_COLUMNS && (
            <div className="shrink-0 px-4 pt-4">
              <div className="relative">
                <IconSearch
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-subtle"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter fields…"
                  aria-label="Filter fields"
                  className="pl-8"
                />
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4">
            {row && visible.length === 0 && (
              <p className="py-6 text-center text-xs text-text-muted">
                No field matches &ldquo;{search}&rdquo;
              </p>
            )}

            {row && visible.length > 0 && (
              // `shrink-0` is what makes this scroll. A flex item whose overflow
              // is not `visible` has an automatic minimum size of zero, so this
              // list was shrinking to fit the viewport and clipping its own rows
              // instead of overflowing and letting the parent scroll.
              <div className="-mx-2 shrink-0 overflow-hidden">
                <dl className="flex flex-col">
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

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
            <span className="text-xs text-text-muted">
              <span className="text-text tabular-nums">{visible.length}</span>
              {visible.length === columns.length ? '' : ` of ${columns.length}`}{' '}
              {columns.length === 1 ? 'field' : 'fields'}
            </span>
            {onEdit && row && (
              <Button size="sm" onClick={() => onEdit(row)}>
                <IconPencil size={14} />
                Edit
              </Button>
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
    <div className="group grid grid-cols-[140px_1fr] items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated/60">
      {/* The type belongs here, not beside the value: it describes the column.
          Under the value it read as part of the data and cost every field a
          second line. */}
      <dt className="flex min-w-0 flex-col gap-0.5 pt-px">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs text-text-muted" title={column.name}>
            {column.name}
          </span>
          {column.isPrimaryKey && <Chip tone="emerald">PK</Chip>}
        </span>
        <span className="truncate font-mono text-[12px] text-text-subtle" title={type}>
          {type}
        </span>
      </dt>

      <dd className="flex min-w-0 items-start gap-1">
        {/* Wrapping, not truncating: the whole point of this view is to show
            the value a grid cell had to cut off. */}
        <span
          className={cn(
            'min-w-0 flex-1 break-words whitespace-pre-wrap',
            // Structured values keep their indentation readable in a fixed-width face.
            isJsonType(column.udtName) ? 'font-mono text-xs leading-5' : 'text-sm',
            isNull || isBlank ? 'text-text-subtle' : 'text-text'
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
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-subtle opacity-0 transition group-hover:opacity-100 hover:bg-surface-active hover:text-text focus-visible:opacity-100"
          >
            <IconCopy size={14} />
          </button>
          {target && !isNull && (
            // Named, not a bare arrow: where it goes is the useful part, and a
            // tooltip only tells you after you have already wondered.
            <button
              type="button"
              onClick={onFollow}
              title={`Go to ${target.schema}.${target.table}.${target.column}`}
              aria-label={`Go to ${target.schema}.${target.table}.${target.column}`}
              className="flex h-6 max-w-[8rem] cursor-pointer items-center gap-1 rounded-md px-1.5 text-accent-text transition-colors hover:bg-accent/8"
            >
              <span className="truncate text-[12px] font-medium">{target.table}</span>
              <IconArrowUpRight size={14} className="shrink-0" />
            </button>
          )}
        </div>
      </dd>
    </div>
  )
}

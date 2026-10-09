/**
 * What a data cell shows: NULL, a quoted blank, an FK link, an enum tag, a
 * boolean chip, or the formatted value.
 *
 * Takes the display string rather than computing it, because the row has
 * already formatted the value once for the cell's `title`.
 */

import { IconArrowUpRight } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { isBlankString } from '@renderer/lib/format'
import { Chip } from '@renderer/components/ui/chip'
import type { ColumnInfo } from '@renderer/types'
import { boolishToString, isBoolType, isJsonType, isUuidType } from '../lib/cell-value'
import type { ForeignKeyTarget } from '../lib/grid-types'

/**
 * Tag tints for enum labels. Written out as literals because Tailwind resolves
 * class names statically - an interpolated `bg-tag-${color}` compiles to nothing.
 */
const ENUM_TINTS = [
  'bg-tag-blue/10 text-tag-blue-text',
  'bg-tag-green/10 text-tag-green-text',
  'bg-tag-violet/10 text-tag-violet-text',
  'bg-tag-amber/12 text-tag-amber-text',
  'bg-tag-cyan/10 text-tag-cyan-text',
  'bg-tag-rose/10 text-tag-rose-text',
  'bg-tag-orange/10 text-tag-orange-text',
  'bg-tag-slate/12 text-text-muted'
]

/**
 * A label keeps its colour wherever it appears: tinted by its position in the
 * enum's own declared order, which is stable, rather than by row.
 */
function enumTint(label: string, labels: string[]): string {
  const index = labels.indexOf(label)
  return ENUM_TINTS[(index < 0 ? labels.length : index) % ENUM_TINTS.length]
}

/** Raw machine values keep the monospace face; everything else reads as prose. */
function isRawValueType(udt: string): boolean {
  return isUuidType(udt) || isJsonType(udt)
}

interface GridCellContentProps {
  column: ColumnInfo
  /** Position among the data columns; the first one names the row. */
  columnIndex: number
  value: unknown
  display: string
  fkTarget?: ForeignKeyTarget
  onOpenForeignKey?: (column: string, value: unknown) => void
  /** -1 keeps the FK button out of the tab order on rows the cursor is not on. */
  tabIndex: number
}

export function GridCellContent({
  column,
  columnIndex,
  value,
  display,
  fkTarget,
  onOpenForeignKey,
  tabIndex
}: GridCellContentProps) {
  if (value === null) {
    return <span className="italic text-text-subtle">NULL</span>
  }
  // '' and '   ' both render as an empty cell otherwise, with no way to tell
  // which one is failing to match a comparison.
  if (isBlankString(value)) {
    return <span className="italic text-text-subtle">{`'${value}'`}</span>
  }
  if (fkTarget && onOpenForeignKey) {
    const label = `Go to ${fkTarget.schema}.${fkTarget.table}.${fkTarget.column}`
    return (
      <span className="flex max-w-full items-center gap-1">
        <span className="truncate text-accent-text underline decoration-accent-text/25 underline-offset-[3px]">
          {display}
        </span>
        <button
          type="button"
          tabIndex={tabIndex}
          onClick={(e) => {
            e.stopPropagation()
            onOpenForeignKey(column.name, value)
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 cursor-pointer rounded-md p-0.5 text-accent-text opacity-0 transition-opacity hover:bg-accent/10 focus-visible:opacity-100 group-hover:opacity-100"
          title={label}
          aria-label={label}
        >
          <IconArrowUpRight size={14} />
        </button>
      </span>
    )
  }
  // Closed domains read as tags, as Attio draws a status: tinted, mixed case,
  // and the label exactly as stored.
  if (column.enumValues != null && column.enumValues.length > 0) {
    return (
      <Chip className={cn('max-w-full truncate', enumTint(display, column.enumValues))}>
        {display}
      </Chip>
    )
  }
  if (isBoolType(column.udtName)) {
    return (
      <Chip tone={boolishToString(value) === 'true' ? 'emerald' : 'neutral'} className="max-w-full">
        {display}
      </Chip>
    )
  }
  return (
    <span
      className={cn(
        'text-text',
        isRawValueType(column.udtName) && 'font-mono text-xs',
        // The first column names the row, as Attio's record column does.
        columnIndex === 0 && 'font-medium'
      )}
    >
      {display}
    </span>
  )
}

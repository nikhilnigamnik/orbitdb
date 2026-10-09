import {
  IconAlignLeft,
  IconBraces,
  IconBrackets,
  IconCalendar,
  IconClock,
  IconFileDigit,
  IconFingerprint,
  IconHash,
  IconKey,
  IconTag,
  IconToggleLeft,
  type Icon
} from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import type { ColumnInfo } from '@renderer/types'

export type ColumnTypeKind =
  | 'key'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'json'
  | 'uuid'
  | 'enum'
  | 'array'
  | 'binary'
  | 'text'

const ICON_BY_KIND: Record<ColumnTypeKind, Icon> = {
  key: IconKey,
  number: IconHash,
  boolean: IconToggleLeft,
  date: IconCalendar,
  time: IconClock,
  json: IconBraces,
  uuid: IconFingerprint,
  enum: IconTag,
  array: IconBrackets,
  binary: IconFileDigit,
  text: IconAlignLeft
}

const NUMBER_RE = /^(int|float|numeric|decimal|money|serial|real|double|bigint|smallint|tinyint)/

/**
 * What kind of value a column holds, for the icon in front of its name.
 *
 * Read off `udtName`, which every driver normalises onto Postgres spellings
 * (`int4`, `bool`, `json`), so one table covers all three engines. A primary key
 * wins over its type: which column identifies the row is the more useful fact.
 */
export function columnTypeKind(
  column: Pick<ColumnInfo, 'udtName' | 'dataType' | 'isPrimaryKey' | 'enumValues'>
): ColumnTypeKind {
  if (column.isPrimaryKey) return 'key'
  if (column.enumValues != null && column.enumValues.length > 0) return 'enum'
  const udt = (column.udtName || column.dataType || '').toLowerCase()
  if (udt.startsWith('_') || udt.endsWith('[]') || udt === 'array') return 'array'
  if (udt === 'bool' || udt === 'boolean') return 'boolean'
  if (udt === 'json' || udt === 'jsonb') return 'json'
  if (udt === 'uuid') return 'uuid'
  if (udt === 'bytea' || udt.includes('blob') || udt.includes('binary')) return 'binary'
  if (udt.startsWith('timestamp') || udt === 'date' || udt === 'datetime') return 'date'
  if (udt.startsWith('time') || udt === 'interval') return 'time'
  if (NUMBER_RE.test(udt)) return 'number'
  return 'text'
}

interface ColumnTypeIconProps {
  column: Pick<ColumnInfo, 'udtName' | 'dataType' | 'isPrimaryKey' | 'enumValues'>
  size?: number
  className?: string
}

export function ColumnTypeIcon({ column, size = 14, className }: ColumnTypeIconProps) {
  const kind = columnTypeKind(column)
  const TypeIcon = ICON_BY_KIND[kind]
  return (
    <TypeIcon
      size={size}
      stroke={1.75}
      aria-hidden
      data-kind={kind}
      className={cn('shrink-0 text-text-subtle', className)}
    />
  )
}

/**
 * Values headed for a json/jsonb column, made bindable.
 *
 * Both socket drivers hand a JSON column back already parsed, and the grid sends
 * those same objects back on an undo or an edit. Bound raw, they break: mysql2
 * formats a plain object as '[object Object]', and node-pg turns an array into
 * a Postgres array literal ('{1,2}'), which a json column rejects. Serialising
 * them first sends the JSON text both engines expect.
 *
 * Strings pass through untouched - they are already JSON text typed by the user,
 * and stringifying them again would store a quoted string instead.
 */

import type { ColumnInfo } from '../../shared/types'

const JSON_TYPES = new Set(['json', 'jsonb'])

export function isJsonColumn(column: Pick<ColumnInfo, 'dataType' | 'udtName'>): boolean {
  return (
    JSON_TYPES.has(column.udtName.toLowerCase()) || JSON_TYPES.has(column.dataType.toLowerCase())
  )
}

export function toBindValue(
  column: Pick<ColumnInfo, 'dataType' | 'udtName'> | undefined,
  value: unknown
): unknown {
  if (!column || !isJsonColumn(column)) return value
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date || ArrayBuffer.isView(value)) return value
  return JSON.stringify(value)
}

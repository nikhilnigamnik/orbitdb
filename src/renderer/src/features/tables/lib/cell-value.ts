import type { ColumnInfo } from '@renderer/types'

export function isJsonType(udt: string): boolean {
  return udt === 'json' || udt === 'jsonb'
}

export function isBoolType(udt: string): boolean {
  return udt === 'bool'
}

export function isNumericType(udt: string): boolean {
  return ['int2', 'int4', 'int8', 'numeric', 'float4', 'float8', 'money'].includes(udt)
}

/** Turns a raw cell value into the editable string shown in an input. */
export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/** Converts the edited string back to a typed value for the given column. Throws on invalid input. */
export function coerceCellValue(col: ColumnInfo, raw: string, isNull: boolean): unknown {
  if (isNull) return null
  if (isBoolType(col.udtName)) {
    if (raw === '' || raw == null) return null
    return raw === 'true' || raw === 't' || raw === '1'
  }
  if (isJsonType(col.udtName) && raw.trim() !== '') {
    try {
      return JSON.parse(raw)
    } catch {
      throw new Error(`Column "${col.name}": invalid JSON`)
    }
  }
  if (isNumericType(col.udtName) && raw.trim() !== '') {
    const num = Number(raw)
    if (Number.isNaN(num)) throw new Error(`Column "${col.name}": invalid number`)
    return num
  }
  return raw
}

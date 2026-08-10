import { stringifyDate } from '@renderer/lib/format'
import type { ColumnInfo } from '@renderer/types'

const INTEGER_TYPES = ['int2', 'int4', 'int8']
const FLOAT_TYPES = ['float4', 'float8']
const DECIMAL_TYPES = ['numeric', 'money']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

export function isJsonType(udt: string): boolean {
  return udt === 'json' || udt === 'jsonb'
}

export function isBoolType(udt: string): boolean {
  return udt === 'bool'
}

export function isIntegerType(udt: string): boolean {
  return INTEGER_TYPES.includes(udt)
}

export function isNumericType(udt: string): boolean {
  return INTEGER_TYPES.includes(udt) || FLOAT_TYPES.includes(udt) || DECIMAL_TYPES.includes(udt)
}

export function isUuidType(udt: string): boolean {
  return udt === 'uuid'
}

export function isDateOnlyType(udt: string): boolean {
  return udt === 'date'
}

/**
 * Enum labels safe to offer in a dropdown editor. Radix Select reserves the
 * empty-string value, so enums containing a '' label fall back to free text.
 */
export function editableEnumValues(col: ColumnInfo): string[] | null {
  const values = col.enumValues
  if (values == null || values.length === 0 || values.includes('')) return null
  return values
}

/** Normalizes engine-specific truthy values (pg `t`, mysql `1`) for boolean editors. */
export function boolishToString(value: unknown): 'true' | 'false' | '' {
  if (value === null || value === undefined || value === '') return ''
  if (value === true || value === 1 || value === '1' || value === 't' || value === 'true') {
    return 'true'
  }
  return 'false'
}

/** Turns a raw cell value into the editable string shown in an input. */
export function stringifyValue(value: unknown, udtName?: string): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return stringifyDate(value, udtName)
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
  const trimmed = raw.trim()
  if (isIntegerType(col.udtName) && trimmed !== '') {
    if (!/^[+-]?\d+$/.test(trimmed)) {
      throw new Error(`Column "${col.name}": invalid integer`)
    }
    const num = Number(trimmed)
    // Beyond Number's safe range the string goes through as-is so the
    // driver binds it without losing precision (all engines cast text).
    return Number.isSafeInteger(num) ? num : trimmed
  }
  if (FLOAT_TYPES.includes(col.udtName) && trimmed !== '') {
    const num = Number(trimmed)
    if (Number.isNaN(num)) throw new Error(`Column "${col.name}": invalid number`)
    return num
  }
  if (col.udtName === 'numeric' && trimmed !== '') {
    if (!NUMERIC_RE.test(trimmed)) {
      throw new Error(`Column "${col.name}": invalid number`)
    }
    // Arbitrary-precision decimals are sent as strings - Number() would round them.
    return trimmed
  }
  // money accepts locale formats like `$1,234.56`; let the server parse it.
  if (col.udtName === 'money' && trimmed !== '') return trimmed
  if (isUuidType(col.udtName) && trimmed !== '') {
    if (!UUID_RE.test(trimmed)) {
      throw new Error(`Column "${col.name}": invalid UUID`)
    }
    return trimmed.toLowerCase()
  }
  if (col.characterMaximumLength != null && raw.length > col.characterMaximumLength) {
    throw new Error(
      `Column "${col.name}": exceeds ${col.characterMaximumLength} character${col.characterMaximumLength === 1 ? '' : 's'}`
    )
  }
  return raw
}

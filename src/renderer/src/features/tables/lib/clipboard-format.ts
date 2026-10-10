import { formatCellValue, stringifyDate } from '@renderer/lib/format'
import type { DatabaseEngine } from '@renderer/types'

/**
 * Turning grid cells into text someone can paste somewhere else.
 *
 * Three shapes, because the destination decides: a spreadsheet wants TSV, a
 * script wants JSON, and another database wants INSERT statements.
 */

/** Column name to the engine's type name, so a date copies as the grid shows it. */
export type UdtNames = Record<string, string | undefined>

export function udtNamesOf(columns: { name: string; udtName?: string }[]): UdtNames {
  return Object.fromEntries(columns.map((column) => [column.name, column.udtName]))
}

/**
 * One cell as plain text, exactly as the grid renders it. Null becomes empty -
 * a spreadsheet has no NULL.
 *
 * Dates go through the grid's own formatter rather than `toISOString()`: pg
 * hands a `date` over as local midnight and a naive `timestamp` as local time,
 * so the UTC instant of either is a different day or hour from what the cell
 * shows.
 */
function cellText(value: unknown, udtName?: string): string {
  if (value === null || value === undefined) return ''
  return formatCellValue(value, udtName)
}

/**
 * Excel's rule: a field containing a tab, a newline or a quote is wrapped in
 * quotes with its own quotes doubled. Without it, one multi-line JSON column
 * silently becomes several rows on paste.
 */
function tsvField(value: unknown, udtName?: string): string {
  const text = cellText(value, udtName)
  if (!/[\t\n\r"]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export interface TsvOptions {
  /** Prepend the column names. Off for a single cell, where a header is noise. */
  withHeader?: boolean
  /** Column types, where known: a `date` column then copies without a time. */
  udtNames?: UdtNames
}

export function toTsv(
  rows: Record<string, unknown>[],
  columns: string[],
  options: TsvOptions = {}
): string {
  const lines = options.withHeader ? [columns.join('\t')] : []
  for (const row of rows) {
    lines.push(
      columns.map((column) => tsvField(row[column], options.udtNames?.[column])).join('\t')
    )
  }
  return lines.join('\n')
}

/**
 * JSON, keeping the original values rather than their display text - the point
 * of this format over TSV is that a number stays a number.
 *
 * A single cell copies as its bare value: `{"total": 42}` is not what someone
 * highlighting one number wants back.
 */
export function toJsonText(rows: Record<string, unknown>[], columns: string[]): string {
  const picked = rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])))
  if (picked.length === 1 && columns.length === 1) {
    return JSON.stringify(picked[0][columns[0]] ?? null, null, 2)
  }
  return JSON.stringify(picked, null, 2)
}

function quoteIdent(name: string, engine: DatabaseEngine): string {
  if (engine === 'mysql') return `\`${name.replace(/`/g, '``')}\``
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * A Date as the engine will read it back to the same wall-clock value the grid
 * shows.
 *
 * Postgres gets the local time with its offset: it honours the offset for a
 * timestamptz and ignores it when casting to a date or a naive timestamp, so
 * one form is right for all three. MySQL gets the bare local time, because
 * MySQL 8 converts an offset literal into the session zone - and the grid's
 * value already is session time. The UTC instant that `toISOString()` gives
 * is the wrong day for a `date` and the wrong hour for a naive timestamp.
 */
function sqlDateLiteral(value: Date, engine: DatabaseEngine): string {
  if (Number.isNaN(value.getTime())) return 'NULL'
  return `'${stringifyDate(value, engine === 'mysql' ? 'timestamp' : 'timestamptz')}'`
}

/**
 * A SQL literal. Escaping differs by engine: MySQL treats a backslash as an
 * escape character inside a string by default, so a Windows path or a regex
 * pasted into Postgres-style quoting arrives mangled.
 */
function sqlLiteral(value: unknown, engine: DatabaseEngine): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return sqlDateLiteral(value, engine)

  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const escaped =
    engine === 'mysql' ? text.replace(/\\/g, '\\\\').replace(/'/g, "''") : text.replace(/'/g, "''")
  return `'${escaped}'`
}

export interface InsertTarget {
  schema: string
  table: string
  engine: DatabaseEngine
}

/**
 * INSERT statements for the copied rows.
 *
 * This builds SQL in the renderer, unlike the seed feature, which builds it in
 * main on purpose. The difference is where the SQL goes: this lands on the
 * clipboard for a person to read and run somewhere, while a seed executes
 * unseen. Quoting still has to be engine-correct, hence `engine`.
 */
export function toInsertSql(
  rows: Record<string, unknown>[],
  columns: string[],
  target: InsertTarget
): string {
  if (rows.length === 0 || columns.length === 0) return ''
  // D1 has one schema and never needs qualifying; the others do.
  const name =
    target.engine === 'd1' || !target.schema
      ? quoteIdent(target.table, target.engine)
      : `${quoteIdent(target.schema, target.engine)}.${quoteIdent(target.table, target.engine)}`
  const columnList = columns.map((c) => quoteIdent(c, target.engine)).join(', ')

  return rows
    .map((row) => {
      const values = columns.map((c) => sqlLiteral(row[c], target.engine)).join(', ')
      return `INSERT INTO ${name} (${columnList}) VALUES (${values});`
    })
    .join('\n')
}

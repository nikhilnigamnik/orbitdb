import type { DatabaseEngine } from '@renderer/types'

/**
 * Turning grid cells into text someone can paste somewhere else.
 *
 * Three shapes, because the destination decides: a spreadsheet wants TSV, a
 * script wants JSON, and another database wants INSERT statements.
 */

/** One cell as plain text. Null becomes empty - a spreadsheet has no NULL. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/**
 * Excel's rule: a field containing a tab, a newline or a quote is wrapped in
 * quotes with its own quotes doubled. Without it, one multi-line JSON column
 * silently becomes several rows on paste.
 */
function tsvField(value: unknown): string {
  const text = cellText(value)
  if (!/[\t\n\r"]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export interface TsvOptions {
  /** Prepend the column names. Off for a single cell, where a header is noise. */
  withHeader?: boolean
}

export function toTsv(
  rows: Record<string, unknown>[],
  columns: string[],
  options: TsvOptions = {}
): string {
  const lines = options.withHeader ? [columns.join('\t')] : []
  for (const row of rows) {
    lines.push(columns.map((column) => tsvField(row[column])).join('\t'))
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
 * A SQL literal. Escaping differs by engine: MySQL treats a backslash as an
 * escape character inside a string by default, so a Windows path or a regex
 * pasted into Postgres-style quoting arrives mangled.
 */
function sqlLiteral(value: unknown, engine: DatabaseEngine): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'

  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)

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

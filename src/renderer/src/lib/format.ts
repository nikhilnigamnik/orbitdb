import { format as formatDate } from 'date-fns'

/** Binary columns (bytea, blob) arrive as bytes over the IPC structured clone. */
export function isBinaryValue(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(1)} kB`
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Render a Date for a column of `udtName`.
 *
 * A timestamptz is an absolute instant, so it keeps its UTC offset — without it
 * the displayed time silently reads as local, and saving the string back shifts
 * the value when the server timezone differs. (The type predicates live in
 * features/tables/lib/cell-value.ts; comparing here avoids a cycle.)
 */
export function stringifyDate(value: Date, udtName?: string): string {
  if (Number.isNaN(value.getTime())) return String(value)
  if (udtName === 'date') return formatDate(value, 'yyyy-MM-dd')
  const base = value.getMilliseconds() === 0 ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd HH:mm:ss.SSS'
  return formatDate(value, udtName === 'timestamptz' ? `${base}XXX` : base)
}

/**
 * A cell value as displayed in a grid. Pass `udtName` where the column type is
 * known so dates match what the editor shows; raw query results have no column
 * metadata and go without.
 */
export function formatCellValue(value: unknown, udtName?: string): string {
  if (value === null) return 'NULL'
  if (value === undefined) return ''
  if (isBinaryValue(value)) return `<binary, ${formatBytes(value.byteLength)}>`
  if (value instanceof Date) return stringifyDate(value, udtName)
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/**
 * A string that renders as an empty cell — indistinguishable from any other
 * blank one unless it is quoted.
 */
export function isBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === ''
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '--'
  return new Intl.NumberFormat().format(value)
}

export function shortPostgresVersion(version: string): string {
  return shortServerVersion(version)
}

export function shortServerVersion(version: string): string {
  if (!version) return ''
  const pg = version.match(/PostgreSQL\s+([\d.]+)/i)
  if (pg) return `Postgres ${pg[1]}`
  const sqlite = version.match(/SQLite\s+([\d.]+)/i)
  if (sqlite) return `SQLite ${sqlite[1]}`
  // Common MySQL/MariaDB version strings start with the version number.
  const mariadb = version.match(/([\d.]+)[-+].*MariaDB/i)
  if (mariadb) return `MariaDB ${mariadb[1]}`
  const mysql = version.match(/^([\d.]+)/)
  if (mysql) return `MySQL ${mysql[1]}`
  return version.slice(0, 60)
}

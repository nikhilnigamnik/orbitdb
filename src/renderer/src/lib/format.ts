import { format as formatDate } from 'date-fns'

export function formatCellValue(value: unknown): string {
  if (value === null) return 'NULL'
  if (value === undefined) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return String(value)
    return formatDate(
      value,
      value.getMilliseconds() === 0 ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd HH:mm:ss.SSS'
    )
  }
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

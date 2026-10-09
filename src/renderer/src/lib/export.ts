export type ExportFormat = 'json' | 'csv' | 'xlsx'

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').replace(/Z$/, '')
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'export'
}

export function buildExportFilename(parts: string[], extension: string): string {
  const base = parts.map(sanitizeSegment).filter(Boolean).join('-')
  return `${base}_${isoTimestamp()}.${extension}`
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  return value
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, jsonReplacer, 2)
  triggerDownload(new Blob([json], { type: 'application/json' }), filename)
}

type Row = Record<string, unknown>

function headerFor(rows: Row[], columns?: string[]): string[] {
  if (columns && columns.length > 0) return columns
  const keys = new Set<string>()
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key)
  return [...keys]
}

/** Normalize a cell to a spreadsheet-friendly primitive (objects → JSON text). */
export function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value, jsonReplacer)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value
  }
  return String(value)
}

// A spreadsheet reads a field starting with one of these as a formula, so a
// stored `=HYPERLINK(...)` would run when the export is opened. Tab and CR are
// on OWASP's list because some importers strip them and expose what follows.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/
// pg hands numeric and bigint columns over as strings, so "-12.50" arrives as
// text. It is a number, not a formula, and prefixing it would corrupt it.
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

export const CSV_BOM = '\uFEFF'

/**
 * One CSV field. Text that a spreadsheet would run as a formula gets a leading
 * `'`, which spreadsheets read as "this is text".
 */
export function escapeCsvField(value: string | number | boolean | null): string {
  if (value === null) return ''
  const raw = String(value)
  const isFormula = FORMULA_TRIGGER.test(raw) && !PLAIN_NUMBER.test(raw)
  const str = typeof value === 'string' && isFormula ? `'${raw}` : raw
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

/** The CSV text itself, BOM included, so it can be tested without a download. */
export function toCsv(rows: Row[], columns?: string[]): string {
  const header = headerFor(rows, columns)
  const lines = [header.map(escapeCsvField).join(',')]
  for (const row of rows) {
    lines.push(header.map((col) => escapeCsvField(normalizeCell(row[col]))).join(','))
  }
  // The BOM is what makes Excel read the file as UTF-8 rather than ANSI.
  return `${CSV_BOM}${lines.join('\r\n')}`
}

export function downloadCsv(filename: string, rows: Row[], columns?: string[]): void {
  triggerDownload(new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' }), filename)
}

export async function downloadXlsx(
  filename: string,
  rows: Row[],
  columns?: string[]
): Promise<void> {
  // Lazy-loaded: xlsx is ~900 KB, only pulled in when an Excel export is requested.
  const XLSX = await import('xlsx')
  const header = headerFor(rows, columns)
  const matrix: (string | number | boolean | null)[][] = [
    header,
    ...rows.map((row) => header.map((col) => normalizeCell(row[col])))
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(matrix)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    filename
  )
}

/** Writes `rows` to a file in `format`, named from `filenameParts` (e.g. schema, table). */
export async function exportToFile(
  format: ExportFormat,
  filenameParts: string[],
  rows: Row[],
  columns?: string[]
): Promise<void> {
  const filename = buildExportFilename(filenameParts, format)
  if (format === 'json') return downloadJson(filename, rows)
  if (format === 'csv') return downloadCsv(filename, rows, columns)
  await downloadXlsx(filename, rows, columns)
}

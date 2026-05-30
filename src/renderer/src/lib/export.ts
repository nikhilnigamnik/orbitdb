/** Hard cap on rows pulled for a full-table export, to avoid runaway fetches. */
export const EXPORT_ROW_LIMIT = 100_000

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
function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value, jsonReplacer)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value
  }
  return String(value)
}

function escapeCsvField(value: string | number | boolean | null): string {
  if (value === null) return ''
  const str = String(value)
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function downloadCsv(filename: string, rows: Row[], columns?: string[]): void {
  const header = headerFor(rows, columns)
  const lines = [header.map(escapeCsvField).join(',')]
  for (const row of rows) {
    lines.push(header.map((col) => escapeCsvField(normalizeCell(row[col]))).join(','))
  }
  // Prepend a BOM so Excel reads UTF-8 correctly.
  triggerDownload(
    new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
    filename
  )
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

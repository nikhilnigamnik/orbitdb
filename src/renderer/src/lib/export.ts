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

export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, jsonReplacer, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

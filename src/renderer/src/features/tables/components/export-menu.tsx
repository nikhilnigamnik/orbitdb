import * as React from 'react'
import { IconJson, IconFileTypeCsv, IconFileTypeXls, IconClipboard } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@renderer/components/ui/dropdown-menu'
import {
  buildExportFilename,
  downloadCsv,
  downloadJson,
  downloadXlsx,
  type ExportFormat
} from '@renderer/lib/export'
import { toInsertSql, toJsonText, toTsv, type InsertTarget } from '../lib/clipboard-format'

interface ExportMenuProps {
  /** Rows to export, already resolved (e.g. current page or current selection). */
  rows: Record<string, unknown>[]
  /** Column order for tabular formats (csv/xlsx). */
  columns: string[]
  /** Filename segments, e.g. [schema, table]. */
  filenameParts: string[]
  /** The trigger element (rendered via `asChild`). */
  children: React.ReactNode
  align?: 'start' | 'end' | 'center'
  side?: 'top' | 'bottom' | 'left' | 'right'
  /**
   * Enables the clipboard entries. The grid's own Cmd+C covers a cell range;
   * these act on whole rows, which is where `INSERT` makes sense.
   */
  insertTarget?: InsertTarget
  onCopied?: (label: string) => void
  onCopyFailed?: (error: unknown) => void
}

export function ExportMenu({
  rows,
  columns,
  filenameParts,
  children,
  align = 'end',
  side = 'bottom',
  insertTarget,
  onCopied,
  onCopyFailed
}: ExportMenuProps) {
  async function copy(label: string, text: string) {
    if (rows.length === 0) return
    try {
      await navigator.clipboard.writeText(text)
      onCopied?.(label)
    } catch (err) {
      onCopyFailed?.(err)
    }
  }

  async function run(format: ExportFormat) {
    if (rows.length === 0) return
    const filename = buildExportFilename(filenameParts, format)
    try {
      if (format === 'json') downloadJson(filename, rows)
      else if (format === 'csv') downloadCsv(filename, rows, columns)
      else await downloadXlsx(filename, rows, columns)
    } catch (err) {
      // No toast surface yet - log so the export failure isn't fully silent.
      console.error(`Failed to export as ${format}:`, err)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side}>
        <DropdownMenuItem onSelect={() => run('json')}>
          <IconJson size={13} />
          JSON (.json)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('csv')}>
          <IconFileTypeCsv size={13} />
          CSV (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('xlsx')}>
          <IconFileTypeXls size={13} />
          Excel (.xlsx)
        </DropdownMenuItem>
        {insertTarget && (
          <>
            <DropdownMenuItem
              className="border-t border-border"
              onSelect={() => void copy('text', toTsv(rows, columns, { withHeader: true }))}
            >
              <IconClipboard size={13} />
              Copy as text
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copy('JSON', toJsonText(rows, columns))}>
              <IconClipboard size={13} />
              Copy as JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void copy('SQL', toInsertSql(rows, columns, insertTarget))}
            >
              <IconClipboard size={13} />
              Copy as INSERT
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

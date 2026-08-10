import * as React from 'react'
import { IconJson, IconFileTypeCsv, IconFileTypeXls } from '@tabler/icons-react'
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
}

export function ExportMenu({
  rows,
  columns,
  filenameParts,
  children,
  align = 'end',
  side = 'bottom'
}: ExportMenuProps) {
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

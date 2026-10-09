import * as React from 'react'
import { IconJson, IconFileTypeCsv, IconFileTypeXls, IconClipboard } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import { useToast } from '@renderer/components/ui/toast'
import { exportToFile, type ExportFormat } from '@renderer/lib/export'
import { errorMessage } from '@renderer/lib/errors'
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
  const toast = useToast()

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
    try {
      await exportToFile(format, filenameParts, rows, columns)
    } catch (err) {
      toast.error('Export failed', { description: errorMessage(err) })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side}>
        <DropdownMenuItem onSelect={() => void run('json')}>
          <IconJson size={16} />
          JSON (.json)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('csv')}>
          <IconFileTypeCsv size={16} />
          CSV (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('xlsx')}>
          <IconFileTypeXls size={16} />
          Excel (.xlsx)
        </DropdownMenuItem>
        {insertTarget && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void copy('text', toTsv(rows, columns, { withHeader: true }))}
            >
              <IconClipboard size={16} />
              Copy as text
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copy('JSON', toJsonText(rows, columns))}>
              <IconClipboard size={16} />
              Copy as JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void copy('SQL', toInsertSql(rows, columns, insertTarget))}
            >
              <IconClipboard size={16} />
              Copy as INSERT
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

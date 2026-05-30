import { useNavigate } from 'react-router-dom'
import {
  IconDots,
  IconFileExport,
  IconJson,
  IconFileTypeCsv,
  IconFileTypeXls,
  IconRefresh,
  IconPencil,
  IconColumns,
  IconEraser,
  IconTrash,
  IconCopy,
  IconSitemap
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
} from '@renderer/components/ui/dropdown-menu'
import { useTableDestructiveActions } from '@renderer/features/database/lib/use-table-destructive-actions'
import {
  buildExportFilename,
  downloadCsv,
  downloadJson,
  downloadXlsx,
  type ExportFormat
} from '@renderer/lib/export'
import { ROUTES, diagramRoute, tableStructureRoute } from '@renderer/config/routes'
import type { TableDetails } from '@renderer/types'

interface TableOverflowMenuProps {
  connectionId: string
  details: TableDetails
  /** Rows to export — current selection if any, otherwise the current page. */
  exportRows: Record<string, unknown>[]
  exportColumns: string[]
  onRefresh: () => void
  /** Opens the DDL rename dialog (table-only); provided by the container. */
  onRenameTable?: () => void
}

export function TableOverflowMenu({
  connectionId,
  details,
  exportRows,
  exportColumns,
  onRefresh,
  onRenameTable
}: TableOverflowMenuProps) {
  const navigate = useNavigate()
  const isTable = details.type === 'table'

  const { requestTruncate, requestDrop, confirmDialog } = useTableDestructiveActions({
    connectionId,
    schema: details.schema,
    table: details.name,
    onDropped: () => navigate(ROUTES.database, { replace: true })
  })

  async function exportAs(format: ExportFormat) {
    if (exportRows.length === 0) return
    const filename = buildExportFilename([details.schema, details.name], format)
    try {
      if (format === 'json') downloadJson(filename, exportRows)
      else if (format === 'csv') downloadCsv(filename, exportRows, exportColumns)
      else await downloadXlsx(filename, exportRows, exportColumns)
    } catch (err) {
      console.error(`Failed to export as ${format}:`, err)
    }
  }

  async function copyQualifiedName() {
    try {
      await navigator.clipboard.writeText(`${details.schema}.${details.name}`)
    } catch {
      // Clipboard can fail in unfocused windows / without permission — ignore.
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="px-2 text-text-muted hover:bg-surface-elevated hover:text-text"
            aria-label="Table actions"
          >
            <IconDots size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={exportRows.length === 0}>
              <IconFileExport size={13} />
              Export
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => exportAs('json')}>
                <IconJson size={13} />
                JSON (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportAs('csv')}>
                <IconFileTypeCsv size={13} />
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportAs('xlsx')}>
                <IconFileTypeXls size={13} />
                Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => onRefresh()}>
            <IconRefresh size={13} />
            Refresh
          </DropdownMenuItem>

          {isTable && (
            <>
              <DropdownMenuSeparator />
              {onRenameTable && (
                <DropdownMenuItem onSelect={() => onRenameTable()}>
                  <IconPencil size={13} />
                  Rename table
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => navigate(tableStructureRoute(details.schema, details.name))}
              >
                <IconColumns size={13} />
                Alter table
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onSelect={requestTruncate}>
                <IconEraser size={13} />
                Truncate
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onSelect={requestDrop}>
                <IconTrash size={13} />
                Drop
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={copyQualifiedName}>
            <IconCopy size={13} />
            Copy qualified name
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(diagramRoute(details.schema))}>
            <IconSitemap size={13} />
            Open in diagram
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmDialog}
    </>
  )
}

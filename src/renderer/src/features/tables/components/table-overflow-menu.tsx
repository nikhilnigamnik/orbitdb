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
import { useToast } from '@renderer/components/ui/toast'
import { exportToFile, type ExportFormat } from '@renderer/lib/export'
import { errorMessage } from '@renderer/lib/errors'
import { ROUTES, diagramRoute, tableStructureRoute } from '@renderer/config/routes'
import type { TableDetails } from '@renderer/types'

interface TableOverflowMenuProps {
  connectionId: string
  details: TableDetails
  /** Rows to export - current selection if any, otherwise the current page. */
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
  const toast = useToast()
  const isTable = details.type === 'table'

  const { requestTruncate, requestDrop, confirmDialog } = useTableDestructiveActions({
    connectionId,
    schema: details.schema,
    table: details.name,
    onDropped: () => navigate(ROUTES.database, { replace: true })
  })

  async function exportAs(format: ExportFormat) {
    if (exportRows.length === 0) return
    try {
      await exportToFile(format, [details.schema, details.name], exportRows, exportColumns)
    } catch (err) {
      toast.error('Export failed', { description: errorMessage(err) })
    }
  }

  async function copyQualifiedName() {
    try {
      await navigator.clipboard.writeText(`${details.schema}.${details.name}`)
    } catch {
      // Clipboard can fail in unfocused windows / without permission - ignore.
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="subtle" aria-label="Table actions">
            <IconDots size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={exportRows.length === 0}>
              <IconFileExport size={16} />
              Export
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => void exportAs('json')}>
                <IconJson size={16} />
                JSON (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportAs('csv')}>
                <IconFileTypeCsv size={16} />
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportAs('xlsx')}>
                <IconFileTypeXls size={16} />
                Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => onRefresh()}>
            <IconRefresh size={16} />
            Refresh
          </DropdownMenuItem>

          {isTable && (
            <>
              <DropdownMenuSeparator />
              {onRenameTable && (
                <DropdownMenuItem onSelect={() => onRenameTable()}>
                  <IconPencil size={16} />
                  Rename table
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => navigate(tableStructureRoute(details.schema, details.name))}
              >
                <IconColumns size={16} />
                Alter table
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onSelect={requestTruncate}>
                <IconEraser size={16} />
                Truncate
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onSelect={requestDrop}>
                <IconTrash size={16} />
                Drop
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={copyQualifiedName}>
            <IconCopy size={16} />
            Copy qualified name
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(diagramRoute(details.schema))}>
            <IconSitemap size={16} />
            Open in diagram
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmDialog}
    </>
  )
}

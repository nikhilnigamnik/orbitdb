import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IconDots,
  IconPin,
  IconPinFilled,
  IconTable,
  IconPencil,
  IconEraser,
  IconTrash
} from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'
import { useTableDestructiveActions } from '@renderer/features/database/lib/use-table-destructive-actions'
import { ROUTES, tableRoute, tableStructureRoute } from '@renderer/config/routes'
import type { TableInfo } from '@renderer/types'

interface TableActionsMenuProps {
  connectionId: string
  schema: string
  table: TableInfo
  isPinned: boolean
  onTogglePin: () => void
}

export function TableActionsMenu({
  connectionId,
  schema,
  table,
  isPinned,
  onTogglePin
}: TableActionsMenuProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isTable = table.type === 'table'

  const { requestTruncate, requestDrop, confirmDialog } = useTableDestructiveActions({
    connectionId,
    schema,
    table: table.name,
    onDropped: () => {
      if (searchParams.get('schema') === schema && searchParams.get('table') === table.name) {
        navigate(ROUTES.database, { replace: true })
      }
    }
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'mr-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-text-subtle transition-opacity hover:bg-surface hover:text-text',
              'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100'
            )}
            aria-label="Table actions"
            title="Table actions"
          >
            <IconDots size={13} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => onTogglePin()}>
            {isPinned ? <IconPinFilled size={13} /> : <IconPin size={13} />}
            {isPinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(tableRoute(schema, table.name))}>
            <IconTable size={13} />
            Browse data
          </DropdownMenuItem>
          {isTable && (
            <DropdownMenuItem onSelect={() => navigate(tableStructureRoute(schema, table.name))}>
              <IconPencil size={13} />
              Alter table
            </DropdownMenuItem>
          )}
          {isTable && (
            <>
              <DropdownMenuSeparator />
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
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmDialog}
    </>
  )
}

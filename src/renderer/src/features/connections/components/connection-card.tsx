import { IconPencil, IconPlug, IconTrash } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { ENGINE_LABEL } from '@renderer/config/site'
import type { SavedConnection } from '@renderer/types'

interface ConnectionCardProps {
  connection: SavedConnection
  isActive: boolean
  isConnecting: boolean
  onConnect: () => void
  onDisconnect: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ConnectionCard({
  connection,
  isActive,
  isConnecting,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete
}: ConnectionCardProps) {
  return (
    <div className="group flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 transition-colors hover:border-[var(--color-border-strong)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isActive ? 'bg-emerald-400' : 'bg-neutral-700'
              }`}
            />
            <span className="truncate text-[13px] font-semibold text-[var(--color-text)]">
              {connection.name}
            </span>
          </div>
          <p className="mt-1.5 truncate font-mono text-[11px] text-[var(--color-text-subtle)]">
            {connection.engine === 'd1'
              ? `${connection.accountId?.slice(0, 8) ?? '—'}/${connection.databaseId?.slice(0, 8) ?? '—'}`
              : `${connection.user}@${connection.host}:${connection.port}/${connection.database}`}
          </p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]"
            onClick={onEdit}
            title="Edit"
          >
            <IconPencil size={13} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-400"
            onClick={onDelete}
            title="Delete"
          >
            <IconTrash size={13} />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-[var(--color-text-subtle)]">
          <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 normal-case tracking-normal text-[10px] text-[var(--color-text-muted)]">
            {ENGINE_LABEL[connection.engine]}
          </span>
          <span>{connection.engine === 'd1' ? 'HTTPS' : connection.ssl ? 'SSL' : 'Plain'}</span>
        </div>
        {isActive ? (
          <Button
            size="sm"
            variant="secondary"
            className="bg-[var(--color-surface-elevated)] text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)]/80"
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-[var(--color-text)] text-[var(--color-bg)] hover:bg-[var(--color-text)]/90"
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? <Spinner size={12} className="text-current" /> : <IconPlug size={12} />}
            Connect
          </Button>
        )}
      </div>
    </div>
  )
}

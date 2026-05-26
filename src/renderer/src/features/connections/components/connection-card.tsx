import * as React from 'react'
import {
  IconDotsVertical,
  IconLoader,
  IconPencil,
  IconPlugConnected,
  IconTrash
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Popover } from '@renderer/components/ui/popover'
import { ENGINE_LABEL } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { SavedConnection } from '@renderer/types'
import { ENGINE_ICON } from './engine-icons'

interface ConnectionCardProps {
  connection: SavedConnection
  isActive: boolean
  isConnecting: boolean
  onConnect: () => void
  onDisconnect: () => void
  onEdit: () => void
  onDelete: () => void
}

const ENGINE_STYLES: Record<SavedConnection['engine'], { bg: string; iconClass: string }> = {
  postgres: { bg: 'bg-sky-500/10', iconClass: 'text-sky-300' },
  mysql: { bg: 'bg-orange-500/10', iconClass: 'text-orange-300' },
  d1: { bg: 'bg-amber-500/10', iconClass: 'text-amber-300' }
}

function hostLabel(connection: SavedConnection): string {
  if (connection.engine === 'd1') {
    return `${connection.accountId?.slice(0, 8) ?? '—'} / ${connection.databaseId?.slice(0, 8) ?? '—'}`
  }
  return `${connection.host}:${connection.port}`
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
  const [menuOpen, setMenuOpen] = React.useState(false)
  const engine = ENGINE_STYLES[connection.engine]
  const EngineIcon = ENGINE_ICON[connection.engine]

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3.5 transition-colors',
        isActive
          ? 'border-accent/40 ring-1 ring-accent/30'
          : 'border-border hover:border-border-strong'
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          engine.bg,
          engine.iconClass
        )}
        aria-hidden
      >
        <EngineIcon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-text">{connection.name}</span>
          <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            {ENGINE_LABEL[connection.engine]}
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11.5px] text-text-subtle">
          {hostLabel(connection)}
          <span className="px-1.5 text-text-subtle/60">/</span>
        </p>
      </div>

      <button
        type="button"
        onClick={isActive ? onDisconnect : onConnect}
        disabled={isConnecting}
        aria-label={isActive ? 'Disconnect' : isConnecting ? 'Connecting' : 'Connect'}
        className={cn(
          'group/connect flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed',
          isConnecting
            ? 'border-border bg-surface-elevated/60 text-text-muted'
            : isActive
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              : 'border-border bg-surface-elevated text-text hover:bg-surface-elevated/70'
        )}
      >
        {isConnecting ? (
          <>
            <IconLoader stroke={2} size={12} className="animate-spin" />
            <span>Connecting…</span>
          </>
        ) : isActive ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span>Connected</span>
          </>
        ) : (
          <>
            <IconPlugConnected size={12} className="opacity-70" />
            <span>Connect</span>
          </>
        )}
      </button>

      <div className="shrink-0">
        <Popover
          openPopover={menuOpen}
          setOpenPopover={setMenuOpen}
          align="end"
          popoverContentClassName="w-36 overflow-hidden shadow-xl shadow-black/40"
          content={
            <div className="flex flex-col p-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onEdit()
                }}
                className="flex w-full rounded-md px-1.5 py-1.5 items-center gap-2 text-left text-xs text-text hover:bg-surface-elevated"
              >
                <IconPencil size={13} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
                className="flex w-full rounded-md px-1.5 py-1.5 items-center gap-2 text-left text-xs text-red-400 hover:bg-red-500/10"
              >
                <IconTrash size={13} />
                Delete
              </button>
            </div>
          }
        >
          <Button
            size="icon-xs"
            variant="ghost"
            className="cursor-pointer text-text-muted hover:bg-surface-elevated hover:text-text"
            aria-label="More actions"
          >
            <IconDotsVertical size={14} />
          </Button>
        </Popover>
      </div>
    </div>
  )
}

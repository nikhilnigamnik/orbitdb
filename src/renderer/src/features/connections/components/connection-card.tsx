import * as React from 'react'
import { IconDotsVertical, IconPencil, IconTrash, IconChevronDown } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { ENGINE_LABEL } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
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

const ENGINE_STYLES: Record<SavedConnection['engine'], { bg: string; text: string; label: string }> =
  {
    postgres: { bg: 'bg-sky-500/15', text: 'text-sky-300', label: 'Pg' },
    mysql: { bg: 'bg-orange-500/15', text: 'text-orange-300', label: 'My' },
    d1: { bg: 'bg-amber-500/15', text: 'text-amber-300', label: 'D1' }
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
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const engine = ENGINE_STYLES[connection.engine]

  React.useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [menuOpen])

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
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
          engine.bg,
          engine.text
        )}
        aria-hidden
      >
        {engine.label}
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
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
          isActive
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
            : 'border-border bg-surface-elevated text-text hover:bg-surface-elevated/70'
        )}
      >
        {isConnecting ? (
          <Spinner size={12} className="text-current" />
        ) : (
          <span className="truncate max-w-[10rem]">{connection.database || 'connect'}</span>
        )}
        <IconChevronDown size={12} className="opacity-60" />
      </button>

      <div ref={menuRef} className="relative shrink-0">
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-text-muted hover:bg-surface-elevated hover:text-text"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="More actions"
        >
          <IconDotsVertical size={14} />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-surface shadow-xl shadow-black/40 animate-in fade-in-0 zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onEdit()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text hover:bg-surface-elevated"
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
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-400 hover:bg-red-500/10"
            >
              <IconTrash size={13} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import * as React from 'react'
import {
  IconDotsVertical,
  IconLoader,
  IconLock,
  IconPencil,
  IconPlugConnected,
  IconTrash
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Popover } from '@renderer/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import type { SavedConnection } from '@renderer/types'
import type { ConnectionHealth } from '../lib/use-connection-health'
import { ENGINE_ICON } from './engine-icons'

interface ConnectionCardProps {
  connection: SavedConnection
  isActive: boolean
  isConnecting: boolean
  health?: ConnectionHealth
  healthError?: string
  onConnect: () => void
  onDisconnect: () => void
  onEdit: () => void
  onDelete: () => void
  onRefreshHealth?: () => void
}

const HEALTH_DOT_CLASSES: Record<ConnectionHealth, string> = {
  unknown: 'bg-text-subtle/60',
  checking: 'bg-amber-400 animate-pulse',
  ok: 'bg-emerald-400',
  fail: 'bg-red-500'
}

const HEALTH_LABEL: Record<ConnectionHealth, string> = {
  unknown: 'Status unknown — click to check',
  checking: 'Checking…',
  ok: 'Reachable',
  fail: 'Unreachable'
}

const ENGINE_STYLES: Record<SavedConnection['engine'], { bg: string; iconClass: string }> = {
  postgres: { bg: 'bg-sky-500/10', iconClass: 'text-sky-300' },
  mysql: { bg: 'bg-orange-500/10', iconClass: 'text-orange-300' },
  d1: { bg: 'bg-amber-500/10', iconClass: 'text-amber-300' }
}

function metaParts(connection: SavedConnection): string[] {
  const parts: string[] = []
  if (connection.engine === 'd1') {
    if (connection.databaseId) parts.push(connection.databaseId.slice(0, 8))
    if (connection.accountId) parts.push(`acct ${connection.accountId.slice(0, 6)}`)
  } else {
    if (connection.host)
      parts.push(`${connection.host}${connection.port ? `:${connection.port}` : ''}`)
    if (connection.database) parts.push(connection.database)
    if (connection.user) parts.push(connection.user)
  }
  return parts
}

export function ConnectionCard({
  connection,
  isActive,
  isConnecting,
  health = 'unknown',
  healthError,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onRefreshHealth
}: ConnectionCardProps) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const engine = ENGINE_STYLES[connection.engine]
  const EngineIcon = ENGINE_ICON[connection.engine]

  const parts = metaParts(connection)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3.5 rounded-2xl border bg-surface px-4 py-3 transition-all',
        isActive
          ? 'border-accent/40 shadow-[inset_0_0_0_1px_rgba(72,120,234,0.15)]'
          : 'border-border hover:border-border-strong hover:bg-surface/80'
      )}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ring-white/5',
            engine.bg,
            engine.iconClass
          )}
          aria-hidden
        >
          <EngineIcon className="h-[18px] w-[18px]" />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRefreshHealth?.()
              }}
              aria-label={HEALTH_LABEL[health]}
              className={cn(
                'absolute -bottom-0.5 -right-0.5 flex h-3 w-3 cursor-pointer items-center justify-center rounded-full ring-2 ring-surface transition-transform hover:scale-110',
                HEALTH_DOT_CLASSES[health]
              )}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {HEALTH_LABEL[health]}
            {health === 'fail' && healthError && (
              <div className="mt-1 max-w-[20rem] font-mono text-[10px] text-text-subtle">
                {healthError}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold leading-tight text-text">
            {connection.name}
          </span>
          {connection.ssl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex shrink-0 items-center text-text-subtle">
                  <IconLock size={11} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">SSL enabled</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-text-subtle">
          {parts.length === 0 ? (
            <span className="italic">no host configured</span>
          ) : (
            parts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-text-subtle/40">·</span>}
                <span className="truncate">{part}</span>
              </React.Fragment>
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={isActive ? onDisconnect : onConnect}
        disabled={isConnecting}
        aria-label={isActive ? 'Disconnect' : isConnecting ? 'Connecting' : 'Connect'}
        className={cn(
          'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed',
          isConnecting
            ? 'border-border bg-surface-elevated/60 text-text-muted'
            : isActive
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              : 'border-border bg-surface-elevated text-text hover:border-accent/50 hover:bg-accent/10 hover:text-text'
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
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-text hover:bg-surface-elevated"
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
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-rose-500 hover:bg-rose-500/10"
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
            className={cn(
              'cursor-pointer text-text-muted transition-opacity hover:bg-surface-elevated hover:text-text',
              !menuOpen && 'opacity-0 group-hover:opacity-100'
            )}
            aria-label="More actions"
          >
            <IconDotsVertical size={14} />
          </Button>
        </Popover>
      </div>
    </div>
  )
}

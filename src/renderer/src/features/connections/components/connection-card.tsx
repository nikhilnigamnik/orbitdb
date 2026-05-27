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
import { DEFAULT_ENVIRONMENT, ENVIRONMENT_LABEL } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { ConnectionEnvironment, SavedConnection } from '@renderer/types'
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
  unknown: 'bg-linear-to-b from-neutral-400/70 to-neutral-600/70',
  checking:
    'bg-linear-to-b from-amber-300 to-amber-500 shadow-[0_0_4px_0_rgba(251,191,36,0.45)] animate-pulse',
  ok: 'bg-linear-to-b from-emerald-300 to-emerald-500 shadow-[0_0_4px_0_rgba(52,211,153,0.4)]',
  fail: 'bg-linear-to-b from-rose-300 to-rose-500 shadow-[0_0_4px_0_rgba(244,63,94,0.45)]'
}

const HEALTH_LABEL: Record<ConnectionHealth, string> = {
  unknown: 'Status unknown — click to check',
  checking: 'Checking…',
  ok: 'Reachable',
  fail: 'Unreachable'
}

const ENGINE_STYLES: Record<SavedConnection['engine'], { bg: string; iconClass: string }> = {
  postgres: { bg: 'bg-sky-500/8', iconClass: 'text-sky-300/80' },
  mysql: { bg: 'bg-orange-500/8', iconClass: 'text-orange-300/80' },
  d1: { bg: 'bg-amber-500/8', iconClass: 'text-amber-300/80' }
}

const ENVIRONMENT_CHIP: Record<ConnectionEnvironment, string> = {
  dev: 'bg-linear-to-b from-emerald-500/20 to-emerald-500/5 text-emerald-200 ring-emerald-500/25 shadow-[inset_0_1px_0_rgba(110,231,183,0.35)]',
  stage:
    'bg-linear-to-b from-amber-500/20 to-amber-500/5 text-amber-200 ring-amber-500/25 shadow-[inset_0_1px_0_rgba(252,211,77,0.35)]',
  prod: 'bg-linear-to-b from-rose-500/20 to-rose-500/5 text-rose-200 ring-rose-500/25 shadow-[inset_0_1px_0_rgba(253,164,175,0.35)]'
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
  const environment = connection.environment ?? DEFAULT_ENVIRONMENT

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border bg-surface px-3.5 py-3 transition-colors',
        isActive
          ? 'border-border-strong'
          : 'border-border hover:border-border-strong hover:bg-surface-elevated/30'
      )}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md ring-1 ring-inset ring-white/5',
            engine.bg,
            engine.iconClass
          )}
          aria-hidden
        >
          <EngineIcon className="h-4 w-4" />
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
                'absolute -bottom-0.5 -right-0.5 h-2 w-2 cursor-pointer rounded-full ring-2 ring-surface transition-transform hover:scale-125',
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
          <span className="truncate text-[13.5px] font-medium leading-tight text-text">
            {connection.name}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] ring-1 ring-inset',
              ENVIRONMENT_CHIP[environment]
            )}
          >
            {ENVIRONMENT_LABEL[environment]}
          </span>
          {connection.ssl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex shrink-0 items-center text-text-subtle/70">
                  <IconLock size={11} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">SSL enabled</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-1 truncate font-mono text-[11px] leading-tight text-text-subtle">
          {parts.length === 0 ? (
            <span className="italic">no host configured</span>
          ) : (
            parts.join('  ·  ')
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={isActive ? onDisconnect : onConnect}
        disabled={isConnecting}
        aria-label={isActive ? 'Disconnect' : isConnecting ? 'Connecting' : 'Connect'}
        className={cn(
          'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed',
          isConnecting
            ? 'border-border text-text-muted'
            : isActive
              ? 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/5'
              : 'border-border text-text-muted hover:border-border-strong hover:text-text'
        )}
      >
        {isConnecting ? (
          <>
            <IconLoader stroke={2} size={12} className="animate-spin" />
            <span>Connecting…</span>
          </>
        ) : isActive ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            <span>Connected</span>
          </>
        ) : (
          <>
            <IconPlugConnected size={12} className="opacity-60" />
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

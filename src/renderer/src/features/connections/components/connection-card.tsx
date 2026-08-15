import * as React from 'react'
import {
  IconDatabase,
  IconDotsVertical,
  IconLock,
  IconShieldLock,
  IconPencil,
  IconPlugOff,
  IconTrash
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Spinner } from '@renderer/components/ui/spinner'
import { Popover } from '@renderer/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { DEFAULT_ENVIRONMENT, ENVIRONMENT_LABEL, usesSshTunnel } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { ConnectionEnvironment, SavedConnection } from '@renderer/types'
import type { ConnectionHealth } from '../lib/use-connection-health'
import { ENGINE_ICON } from './engine-icons'

type ChipTone = React.ComponentProps<typeof Chip>['tone']

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
  unknown: 'bg-text-subtle/55',
  checking: 'bg-warning shadow-[0_0_4px_0_rgba(251,191,36,0.45)] animate-pulse',
  ok: 'bg-success shadow-[0_0_4px_0_rgba(52,211,153,0.4)]',
  fail: 'bg-danger shadow-[0_0_4px_0_rgba(244,63,94,0.45)]'
}

const HEALTH_LABEL: Record<ConnectionHealth, string> = {
  unknown: 'Status unknown - click to check',
  checking: 'Checking…',
  ok: 'Reachable',
  fail: 'Unreachable'
}

const ENGINE_STYLES: Record<SavedConnection['engine'], { bg: string; iconClass: string }> = {
  postgres: { bg: 'bg-info/8', iconClass: 'text-info' },
  mysql: { bg: 'bg-orange/8', iconClass: 'text-orange' },
  d1: { bg: 'bg-warning/8', iconClass: 'text-warning' }
}

const ENGINE_FALLBACK = { bg: 'bg-text-muted/8', iconClass: 'text-text-muted' }

const ENVIRONMENT_TONE: Record<ConnectionEnvironment, ChipTone> = {
  dev: 'emerald',
  stage: 'amber',
  prod: 'rose'
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
  const engine = ENGINE_STYLES[connection.engine] ?? ENGINE_FALLBACK
  const EngineIcon = ENGINE_ICON[connection.engine] ?? IconDatabase

  const parts = metaParts(connection)
  const environment = connection.environment ?? DEFAULT_ENVIRONMENT

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border bg-surface px-3.5 py-3 transition-colors',
        isActive ? 'border-border-strong' : 'border-border  hover:bg-surface-elevated/30'
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
              <div className="mt-1 max-w-[20rem] font-mono text-xs text-text-subtle">
                {healthError}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium leading-tight text-text">
            {connection.name}
          </span>
          <Chip tone={ENVIRONMENT_TONE[environment]}>{ENVIRONMENT_LABEL[environment]}</Chip>
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
          {usesSshTunnel(connection) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex shrink-0 items-center text-text-subtle/70">
                  <IconShieldLock size={11} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Tunnelled through {connection.sshHost || 'SSH'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-1 truncate font-mono text-xs leading-tight text-text-subtle">
          {parts.length === 0 ? (
            <span className="italic">no host configured</span>
          ) : (
            parts.join('  ·  ')
          )}
        </div>
      </div>

      <Button
        variant="secondary"
        onClick={isActive ? onDisconnect : onConnect}
        disabled={isConnecting}
        aria-label={isActive ? 'Disconnect' : isConnecting ? 'Connecting' : 'Connect'}
        className={cn(
          'w-28 justify-center',
          isActive && 'hover:border-danger/30 hover:bg-danger/10 hover:text-danger'
        )}
      >
        {isConnecting ? (
          <>
            <Spinner size={12} />
            <span>Connecting…</span>
          </>
        ) : isActive ? (
          // The button reads as the state it is in, and as the action it performs
          // once you reach for it - a green "Connected" button said neither, and
          // gave no hint that clicking it disconnects.
          <>
            <span className="flex items-center gap-1.5 group-hover/button:hidden group-focus-visible/button:hidden">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
              Connected
            </span>
            <span className="hidden items-center gap-1.5 group-hover/button:flex group-focus-visible/button:flex">
              <IconPlugOff size={12} />
              Disconnect
            </span>
          </>
        ) : (
          <span>Connect</span>
        )}
      </Button>

      <div className="shrink-0">
        <Popover
          openPopover={menuOpen}
          setOpenPopover={setMenuOpen}
          align="end"
          popoverContentClassName="w-36 overflow-hidden"
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
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-danger hover:bg-danger/10"
              >
                <IconTrash size={13} />
                Delete
              </button>
            </div>
          }
        >
          <Button
            size="icon-xs"
            variant="secondary"
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

import * as React from 'react'
import {
  IconDatabase,
  IconDots,
  IconLock,
  IconPencil,
  IconPlugOff,
  IconTrash
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Spinner } from '@renderer/components/ui/spinner'
import { Popover } from '@renderer/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  CONNECTION_COLOR_CLASS,
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_LABEL
} from '@renderer/config/site'
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
  checking: 'bg-warning animate-pulse',
  ok: 'bg-success',
  fail: 'bg-danger'
}

const HEALTH_LABEL: Record<ConnectionHealth, string> = {
  unknown: 'Status unknown - click to check',
  checking: 'Checking…',
  ok: 'Reachable',
  fail: 'Unreachable'
}

const ENGINE_STYLES: Record<SavedConnection['engine'], { bg: string; iconClass: string }> = {
  postgres: { bg: 'bg-info/10', iconClass: 'text-info' },
  mysql: { bg: 'bg-orange/10', iconClass: 'text-orange' },
  d1: { bg: 'bg-warning/12', iconClass: 'text-warning' }
}

const ENGINE_FALLBACK = { bg: 'bg-surface-active', iconClass: 'text-text-muted' }

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
  const accent = connection.color ? CONNECTION_COLOR_CLASS[connection.color] : null
  const healthName =
    health === 'fail' && healthError
      ? `${HEALTH_LABEL.fail}: ${healthError}. Click to check again`
      : HEALTH_LABEL[health]

  return (
    // One row of an Attio list: full width, a hairline underneath, and the
    // hover grey rather than a card edge.
    <div
      className={cn(
        'group relative flex h-14 items-center gap-3 border-b border-border px-4 transition-colors',
        isActive ? 'bg-surface-active/40' : 'hover:bg-surface-elevated/60'
      )}
    >
      {/* A rail rather than a tint on the engine tile: the tile already carries
          the engine's colour, and overwriting it would trade one signal for
          another instead of adding one. Pinned to the row's edge so tagged and
          untagged rows keep their tiles in one column. */}
      {accent && (
        <span
          aria-hidden
          className={cn('absolute inset-y-3 left-1.5 w-[3px] rounded-full', accent)}
        />
      )}

      <div className="relative shrink-0">
        <div
          className={cn(
            'flex size-8 items-center justify-center rounded-lg',
            engine.bg,
            engine.iconClass
          )}
          aria-hidden
        >
          <EngineIcon className="size-4" />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* A 24px target around a 10px dot: the padding is the hit area, so
                the dot keeps its size and position on the tile's corner. The
                error is in the name too, not only in a hover tooltip. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRefreshHealth?.()
              }}
              aria-label={healthName}
              className="group/health absolute -right-[9px] -bottom-[9px] flex size-6 cursor-pointer items-center justify-center rounded-full"
            >
              <span
                aria-hidden
                className={cn(
                  'size-2.5 rounded-full ring-2 ring-surface transition-transform group-hover/health:scale-125',
                  HEALTH_DOT_CLASSES[health]
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {HEALTH_LABEL[health]}
            {health === 'fail' && healthError && (
              <div className="mt-1 max-w-[20rem] font-mono text-xs opacity-70">{healthError}</div>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{connection.name}</span>
          <Chip tone={ENVIRONMENT_TONE[environment]}>{ENVIRONMENT_LABEL[environment]}</Chip>
          {connection.ssl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  aria-label="SSL enabled"
                  className="flex shrink-0 items-center text-text-subtle"
                >
                  <IconLock size={14} aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">SSL enabled</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="truncate text-[12px] text-text-subtle tabular-nums">
          {parts.length === 0 ? (
            <span className="italic">no host configured</span>
          ) : (
            parts.join(' · ')
          )}
        </div>
      </div>

      <Button
        variant="outline"
        onClick={isActive ? onDisconnect : onConnect}
        disabled={isConnecting}
        aria-label={isActive ? 'Disconnect' : isConnecting ? 'Connecting' : 'Connect'}
        className={cn('w-28 justify-center', isActive && 'hover:bg-danger/10 hover:text-danger')}
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
              <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
              Connected
            </span>
            <span className="hidden items-center gap-1.5 group-hover/button:flex group-focus-visible/button:flex">
              <IconPlugOff size={14} />
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
          popoverContentClassName="w-40 overflow-hidden"
          content={
            <div className="flex flex-col p-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onEdit()
                }}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-sm text-text hover:bg-surface-elevated"
              >
                <IconPencil size={16} className="text-text-subtle" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-sm text-danger hover:bg-danger/10"
              >
                <IconTrash size={16} />
                Delete
              </button>
            </div>
          }
        >
          <Button size="icon-sm" variant="subtle" aria-label="More actions">
            <IconDots size={16} />
          </Button>
        </Popover>
      </div>
    </div>
  )
}

import * as React from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  IconCheck,
  IconChevronDown,
  IconDatabase,
  IconListDetails,
  IconPlugConnected,
  IconPlugOff,
  IconSchema,
  IconSearch,
  IconSettings,
  IconSquareLetterK,
  IconTerminal2,
  type Icon
} from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { APP_NAME, CONNECTION_TILE_CLASS } from '@renderer/config/site'
import { ROUTES } from '@renderer/config/routes'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { ENGINE_ICON } from '@renderer/features/connections/components/engine-icons'
import { useCommandPalette } from '@renderer/features/command-palette/store'
import { useUpdateCheck } from '@renderer/features/settings/store'
import { SidebarTables } from '@renderer/features/database/components/schema-tree'
import { requestValueSearch } from '@renderer/features/database/lib/schema-events'
import { Kbd } from '@renderer/components/ui/kbd'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import type { SavedConnection } from '@renderer/types'
import orbitdbLogo from '@renderer/assets/orbitdb-mark.svg'

interface NavItem {
  to: string
  label: string
  icon: Icon
  needsConnection: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.connections, label: 'Connections', icon: IconPlugConnected, needsConnection: false },
  { to: ROUTES.database, label: 'Browser', icon: IconDatabase, needsConnection: true },
  { to: ROUTES.diagram, label: 'Diagram', icon: IconSchema, needsConnection: true },
  { to: ROUTES.query, label: 'SQL editor', icon: IconTerminal2, needsConnection: true },
  { to: ROUTES.logs, label: 'Query log', icon: IconListDetails, needsConnection: false }
]

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function Sidebar() {
  const { pathname } = useLocation()
  const { active } = useConnection()
  const { open: openPalette } = useCommandPalette()
  const { result } = useUpdateCheck()
  const hasUpdate = !!result?.hasUpdate

  function isRouteActive(to: string): boolean {
    if (to === ROUTES.connections) return pathname === ROUTES.connections
    return pathname.startsWith(to)
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-bg">
      {/* On macOS the native title bar is hidden and the traffic lights sit in
          this row, so it leaves room for them and doubles as a drag handle. */}
      <div
        className={cn(
          'flex h-12 shrink-0 items-center gap-1 pr-2 [-webkit-app-region:drag]',
          IS_MAC ? 'pl-[84px]' : 'pl-2'
        )}
      >
        <WorkspaceSwitcher />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-2">
        <button
          type="button"
          onClick={openPalette}
          className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg bg-surface pr-1 pl-2 text-left text-sm font-medium text-text shadow-control transition-colors hover:bg-surface-elevated"
        >
          <IconSquareLetterK size={16} stroke={1.75} className="shrink-0 text-text-muted" />
          <span className="flex-1 truncate">Quick actions</span>
          <Kbd>{IS_MAC ? '⌘K' : 'Ctrl K'}</Kbd>
        </button>
        <button
          type="button"
          onClick={() => (active ? requestValueSearch() : openPalette())}
          aria-label="Search"
          title={active ? 'Find a value anywhere' : 'Search'}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-surface pr-1 pl-1.5 text-text-muted shadow-control transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <IconSearch size={15} stroke={1.75} />
          {active && <Kbd>/</Kbd>}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
        <nav className="flex flex-col gap-px px-2 pt-1">
          {NAV_ITEMS.map((item) => (
            <SidebarLink
              key={item.to}
              item={item}
              isActive={isRouteActive(item.to)}
              isDisabled={item.needsConnection && !active}
            />
          ))}
        </nav>

        {active && <SidebarTables connectionId={active.connectionId} />}
      </div>

      <div className="shrink-0 border-t border-border px-2 py-2">
        <SidebarLink
          item={{
            to: ROUTES.settings,
            label: 'Settings',
            icon: IconSettings,
            needsConnection: false
          }}
          isActive={pathname.startsWith(ROUTES.settings)}
          isDisabled={false}
          trailing={
            hasUpdate ? (
              <span className="flex h-5 items-center rounded-md bg-success/10 px-1.5 text-[12px] font-medium text-success-text">
                Update
              </span>
            ) : null
          }
        />
      </div>
    </aside>
  )
}

function SidebarLink({
  item,
  isActive,
  isDisabled,
  trailing
}: {
  item: NavItem
  isActive: boolean
  isDisabled: boolean
  trailing?: React.ReactNode
}) {
  const { to, label, icon: Icon } = item
  return (
    <NavLink
      to={to}
      aria-disabled={isDisabled}
      onClick={(e) => {
        if (isDisabled) e.preventDefault()
      }}
      className={cn(
        'flex h-7 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors',
        isActive ? 'bg-surface-active text-text' : 'text-text hover:bg-surface-active/60',
        isDisabled && 'pointer-events-none opacity-40'
      )}
    >
      <Icon size={16} stroke={1.75} className="shrink-0 text-text-muted" />
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </NavLink>
  )
}

function ConnectionTile({ connection }: { connection: SavedConnection | null }) {
  if (!connection) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-text">
        <img src={orbitdbLogo} alt="" className="size-3.5 brightness-0 invert" />
      </span>
    )
  }
  if (connection.color) {
    return (
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold',
          CONNECTION_TILE_CLASS[connection.color]
        )}
      >
        {connection.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  const EngineIcon = ENGINE_ICON[connection.engine]
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-surface shadow-control">
      <EngineIcon className="size-3.5" />
    </span>
  )
}

/**
 * Attio's workspace switcher, standing in for the active connection: the tile
 * and name of what you are connected to, and a menu to move to another.
 */
function WorkspaceSwitcher() {
  const navigate = useNavigate()
  const { connections, current, connect, disconnect } = useConnection()

  async function switchTo(id: string) {
    if (current?.id === id) return
    try {
      await connect(id)
      navigate(ROUTES.database)
    } catch {
      // The store records connectError; the connections page surfaces it.
      navigate(ROUTES.connections)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-surface-active/60 data-[state=open]:bg-surface-active/60"
        >
          <ConnectionTile connection={current} />
          <span className="truncate text-sm font-semibold text-text">
            {current?.name ?? APP_NAME}
          </span>
          <IconChevronDown size={14} className="shrink-0 text-text-subtle" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {connections.length > 0 && (
          <div className="px-2 pt-1.5 pb-1 text-[12px] font-medium text-text-subtle">
            Connections
          </div>
        )}
        {connections.map((connection) => (
          <DropdownMenuItem key={connection.id} onSelect={() => void switchTo(connection.id)}>
            <ConnectionTile connection={connection} />
            <span className="flex-1 truncate">{connection.name}</span>
            {current?.id === connection.id && <IconCheck size={14} className="!text-accent" />}
          </DropdownMenuItem>
        ))}
        {connections.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => navigate(ROUTES.connections)}>
          <IconPlugConnected size={16} />
          Manage connections
        </DropdownMenuItem>
        {current && (
          <DropdownMenuItem
            onSelect={() => {
              void disconnect()
              navigate(ROUTES.connections)
            }}
          >
            <IconPlugOff size={16} />
            Disconnect
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { NavLink, useLocation } from 'react-router-dom'
import { IconDatabase, IconListDetails, IconPlug, IconTerminal2 } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { APP_NAME } from '@renderer/config/site'
import { ROUTES } from '@renderer/config/routes'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import orbitdbLogo from '@renderer/assets/orbitdb-brand.png'

const NAV_ITEMS = [
  { to: ROUTES.connections, label: 'Connections', icon: IconPlug, end: true },
  { to: ROUTES.database, label: 'Browser', icon: IconDatabase, end: false },
  { to: ROUTES.query, label: 'Query', icon: IconTerminal2, end: false },
  { to: ROUTES.logs, label: 'Query log', icon: IconListDetails, end: false }
]

export function Sidebar() {
  const { pathname } = useLocation()
  const { active, current } = useConnection()

  const isBrowserActive = pathname.startsWith(ROUTES.database)
  const isQueryActive = pathname.startsWith(ROUTES.query)
  const isLogsActive = pathname.startsWith(ROUTES.logs)
  const isConnectionsActive = !isBrowserActive && !isQueryActive && !isLogsActive

  return (
    <aside className="m-1 flex h-[calc(100vh-0.5rem)] w-14 shrink-0 flex-col items-center rounded-xl bg-surface shadow-lg shadow-black/20">
      <div className="flex items-center justify-center pt-4 pb-4">
        <img src={orbitdbLogo} alt={APP_NAME} className="h-7 w-7" />
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => {
          const isActive =
            to === ROUTES.connections
              ? isConnectionsActive
              : to === ROUTES.database
                ? isBrowserActive
                : to === ROUTES.query
                  ? isQueryActive
                  : isLogsActive
          const isDisabled = (to === ROUTES.database || to === ROUTES.query) && !active
          return (
            <Tooltip key={to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={to}
                  end={end}
                  aria-label={label}
                  aria-disabled={isDisabled}
                  onClick={(e) => {
                    if (isDisabled) e.preventDefault()
                  }}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'bg-surface-elevated text-text'
                      : 'text-text-muted hover:bg-surface-elevated hover:text-text',
                    isDisabled && 'pointer-events-none opacity-40'
                  )}
                >
                  <Icon size={16} stroke={1.75} />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      <div className="flex items-center justify-center border-t border-border px-2 py-3">
        {active && current ? (
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-elevated"
            aria-label={`Connected to ${current.name}`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="h-2 w-2 rounded-full bg-neutral-700"
                aria-label="No active connection"
              />
            </TooltipTrigger>
            <TooltipContent side="right">No connection</TooltipContent>
          </Tooltip>
        )}
      </div>
    </aside>
  )
}

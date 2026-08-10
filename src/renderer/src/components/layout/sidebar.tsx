import { NavLink, useLocation } from 'react-router-dom'
import {
  IconDatabase,
  IconListDetails,
  IconPlug,
  IconSchema,
  IconTerminal2,
  IconSettings
} from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { APP_NAME } from '@renderer/config/site'
import { ROUTES } from '@renderer/config/routes'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { useUpdateCheck } from '@renderer/features/settings/store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import orbitdbLogo from '@renderer/assets/orbitdb-icon-transparent.png'

const NAV_ITEMS = [
  { to: ROUTES.connections, label: 'Connections', icon: IconPlug, end: true },
  { to: ROUTES.database, label: 'Browser', icon: IconDatabase, end: false },
  { to: ROUTES.diagram, label: 'Diagram', icon: IconSchema, end: false },
  { to: ROUTES.query, label: 'Query', icon: IconTerminal2, end: false },
  { to: ROUTES.logs, label: 'Query log', icon: IconListDetails, end: false }
]

export function Sidebar() {
  const { pathname } = useLocation()
  const { active } = useConnection()
  const { result } = useUpdateCheck()
  const hasUpdate = !!result?.hasUpdate

  const isBrowserActive = pathname.startsWith(ROUTES.database)
  const isDiagramActive = pathname.startsWith(ROUTES.diagram)
  const isQueryActive = pathname.startsWith(ROUTES.query)
  const isLogsActive = pathname.startsWith(ROUTES.logs)
  const isSettingsActive = pathname.startsWith(ROUTES.settings)
  const isConnectionsActive =
    !isBrowserActive && !isDiagramActive && !isQueryActive && !isLogsActive && !isSettingsActive

  return (
    <aside className="m-1 flex h-[calc(100vh-0.5rem)] w-14 shrink-0 flex-col items-center rounded-xl bg-surface shadow-lg shadow-black/20">
      <div className="flex items-center justify-center pt-4 pb-4">
        <img src={orbitdbLogo} alt={APP_NAME} className="h-6 w-6 object-contain" />
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => {
          const isActive =
            to === ROUTES.connections
              ? isConnectionsActive
              : to === ROUTES.database
                ? isBrowserActive
                : to === ROUTES.diagram
                  ? isDiagramActive
                  : to === ROUTES.query
                    ? isQueryActive
                    : isLogsActive
          const isDisabled =
            (to === ROUTES.database || to === ROUTES.diagram || to === ROUTES.query) && !active
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

      <div className="flex flex-col items-center gap-1.5 px-2 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to={ROUTES.settings}
              aria-label="Settings"
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                isSettingsActive
                  ? 'bg-surface-elevated text-text'
                  : 'text-text-muted hover:bg-surface-elevated hover:text-text'
              )}
            >
              <IconSettings size={16} stroke={1.75} />
              {hasUpdate && (
                <span
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-success ring-2 ring-surface"
                  aria-hidden
                />
              )}
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right">
            {hasUpdate ? 'Settings - update available' : 'Settings'}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  )
}

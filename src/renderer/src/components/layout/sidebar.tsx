import { NavLink, useLocation } from 'react-router-dom'
import { IconDatabase, IconPlug, IconTerminal2 } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { APP_NAME } from '@renderer/config/site'
import { ROUTES } from '@renderer/config/routes'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { shortServerVersion } from '@renderer/lib/format'
import { ENGINE_LABEL } from '@renderer/config/site'

const NAV_ITEMS = [
  { to: ROUTES.connections, label: 'Connections', icon: IconPlug, end: true },
  { to: ROUTES.database, label: 'Browser', icon: IconDatabase, end: false },
  { to: ROUTES.query, label: 'Query', icon: IconTerminal2, end: false }
]

export function Sidebar() {
  const { pathname } = useLocation()
  const { active, current } = useConnection()

  const isBrowserActive = pathname.startsWith(ROUTES.database)
  const isQueryActive = pathname.startsWith(ROUTES.query)
  const isConnectionsActive = !isBrowserActive && !isQueryActive

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2 px-5 pt-12 pb-4">
        <span className="text-[13px] font-semibold tracking-tight text-[var(--color-text)]">
          {APP_NAME}
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => {
          const isActive =
            to === ROUTES.connections
              ? isConnectionsActive
              : to === ROUTES.database
                ? isBrowserActive
                : isQueryActive
          const isDisabled = (to === ROUTES.database || to === ROUTES.query) && !active
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-disabled={isDisabled}
              onClick={(e) => {
                if (isDisabled) e.preventDefault()
              }}
              className={cn(
                'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-[var(--color-surface-elevated)] text-[var(--color-text)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]',
                isDisabled && 'pointer-events-none opacity-40'
              )}
            >
              <Icon size={14} stroke={1.75} />
              {label}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-[var(--color-border)] px-4 py-3">
        {active && current ? (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span className="truncate text-[12px] font-medium text-[var(--color-text)]">
                  {current.name}
                </span>
              </div>
              <span className="shrink-0 rounded border border-[var(--color-border)] px-1 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                {ENGINE_LABEL[current.engine]}
              </span>
            </div>
            <p className="truncate font-mono text-[10.5px] text-[var(--color-text-subtle)]">
              {current.engine === 'd1'
                ? `${current.accountId?.slice(0, 8) ?? '—'}/${current.databaseId?.slice(0, 8) ?? '—'}`
                : `${current.user}@${current.host}:${current.port}`}
            </p>
            {active.serverVersion && (
              <p className="truncate text-[10.5px] text-[var(--color-text-subtle)]">
                {shortServerVersion(active.serverVersion)}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-subtle)]">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-700" />
            <span>No connection</span>
          </div>
        )}
      </div>
    </aside>
  )
}

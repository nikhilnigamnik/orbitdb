import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArrowRight, IconDatabase, IconPlug, IconPlugConnected } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Spinner } from '@renderer/components/ui/spinner'
import { PageHeader } from '@renderer/components/layout/page-header'
import { EmptyState } from '@renderer/components/common/empty-state'
import { ErrorState } from '@renderer/components/common/error-state'
import { LoadingState } from '@renderer/components/common/loading-state'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { ENGINE_ICON } from '@renderer/features/connections/components/engine-icons'
import { ROUTES } from '@renderer/config/routes'
import {
  CONNECTION_COLOR_CLASS,
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_LABEL
} from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { ConnectionEnvironment, SavedConnection } from '@renderer/types'

type ChipTone = React.ComponentProps<typeof Chip>['tone']

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

function subtitle(connection: SavedConnection): string {
  if (connection.engine === 'd1') {
    return connection.databaseId ? `D1 · ${connection.databaseId.slice(0, 8)}` : 'Cloudflare D1'
  }
  const host = connection.host
    ? `${connection.host}${connection.port ? `:${connection.port}` : ''}`
    : 'no host'
  return connection.database ? `${host} · ${connection.database}` : host
}

export function ConnectionPicker() {
  const navigate = useNavigate()
  const { connections, isLoading, error, refresh, connect, isConnecting, connectError } =
    useConnection()
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const sorted = React.useMemo(
    () => [...connections].sort((a, b) => a.name.localeCompare(b.name)),
    [connections]
  )

  async function handleConnect(connection: SavedConnection) {
    if (isConnecting) return
    setPendingId(connection.id)
    try {
      await connect(connection.id)
      // active flips to this connection - DatabasePage re-renders into the data view
    } catch {
      // surfaced via connectError
    } finally {
      setPendingId(null)
    }
  }

  const header = (
    <PageHeader
      breadcrumbs={[{ label: 'Browser', icon: <IconDatabase /> }]}
      actions={
        <Button variant="outline" onClick={() => navigate(ROUTES.connections)}>
          <IconPlugConnected size={14} />
          Manage connections
        </Button>
      }
    />
  )

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <LoadingState />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="p-4">
          <ErrorState title="Failed to load connections" message={error} onRetry={refresh} />
        </div>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 p-4">
          <EmptyState
            className="border-0 bg-transparent"
            icon={<IconPlug size={20} />}
            title="No connections yet"
            description="Add a Postgres, MySQL, or D1 connection to start browsing schemas and tables."
            action={
              <Button variant="outline" onClick={() => navigate(ROUTES.connections)}>
                Add a connection
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex flex-col gap-4 px-4 py-4">
          {connectError && <ErrorState title="Failed to connect" message={connectError} />}

          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex flex-col gap-0.5 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text">Pick a connection</h2>
              <p className="text-xs text-text-muted">
                Connect to start browsing schemas and tables.
              </p>
            </div>

            <ul className="divide-y divide-border">
              {sorted.map((connection) => {
                const engine = ENGINE_STYLES[connection.engine] ?? ENGINE_FALLBACK
                const EngineIcon = ENGINE_ICON[connection.engine] ?? IconDatabase
                const environment = connection.environment ?? DEFAULT_ENVIRONMENT
                const accent = connection.color ? CONNECTION_COLOR_CLASS[connection.color] : null
                const isPending = isConnecting && pendingId === connection.id

                return (
                  <li key={connection.id}>
                    <button
                      type="button"
                      onClick={() => handleConnect(connection)}
                      disabled={isConnecting}
                      className={cn(
                        'group relative flex h-14 w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors',
                        'hover:bg-surface-elevated/60',
                        'disabled:cursor-not-allowed disabled:opacity-60'
                      )}
                    >
                      {accent && (
                        <span
                          aria-hidden
                          className={cn('absolute inset-y-3 left-1.5 w-[3px] rounded-full', accent)}
                        />
                      )}

                      <div
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-lg',
                          engine.bg,
                          engine.iconClass
                        )}
                        aria-hidden
                      >
                        <EngineIcon className="size-4" />
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium text-text">
                            {connection.name}
                          </span>
                          <Chip tone={ENVIRONMENT_TONE[environment]}>
                            {ENVIRONMENT_LABEL[environment]}
                          </Chip>
                        </div>
                        <div className="truncate text-[12px] text-text-subtle tabular-nums">
                          {subtitle(connection)}
                        </div>
                      </div>

                      <span className="flex size-7 shrink-0 items-center justify-center text-text-subtle transition-colors group-hover:text-text">
                        {isPending ? (
                          <Spinner size={14} />
                        ) : (
                          <IconArrowRight
                            size={16}
                            className="transition-transform group-hover:translate-x-0.5"
                          />
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

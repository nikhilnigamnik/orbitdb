import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArrowRight, IconDatabase, IconPlug, IconSettings } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Spinner } from '@renderer/components/ui/spinner'
import { EmptyState } from '@renderer/components/common/empty-state'
import { ErrorState } from '@renderer/components/common/error-state'
import { LoadingState } from '@renderer/components/common/loading-state'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { ENGINE_ICON } from '@renderer/features/connections/components/engine-icons'
import { ROUTES } from '@renderer/config/routes'
import { DEFAULT_ENVIRONMENT, ENVIRONMENT_LABEL } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { ConnectionEnvironment, SavedConnection } from '@renderer/types'

type ChipTone = React.ComponentProps<typeof Chip>['tone']

const ENGINE_STYLES: Record<SavedConnection['engine'], { bg: string; iconClass: string }> = {
  postgres: { bg: 'bg-sky-500/8', iconClass: 'text-sky-300/80' },
  mysql: { bg: 'bg-orange-500/8', iconClass: 'text-orange-300/80' },
  d1: { bg: 'bg-amber-500/8', iconClass: 'text-amber-300/80' }
}

const ENGINE_FALLBACK = { bg: 'bg-neutral-500/8', iconClass: 'text-neutral-300/80' }

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
      // active flips to this connection — DatabasePage re-renders into the data view
    } catch {
      // surfaced via connectError
    } finally {
      setPendingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <ErrorState title="Failed to load connections" message={error} onRetry={refresh} />
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        className="m-6"
        icon={<IconPlug size={24} />}
        title="No connections yet"
        description="Add a Postgres, MySQL, or D1 connection to start browsing schemas and tables."
        action={
          <Button
            size="sm"
            className="bg-accent text-white hover:bg-accent/90"
            onClick={() => navigate(ROUTES.connections)}
          >
            Add a connection
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-subtle">
            <IconPlug size={22} />
          </div>
          <p className="text-xs font-semibold text-text">Pick a connection</p>
          <p className="mt-1 text-xs text-text-subtle">
            Connect to start browsing schemas and tables.
          </p>
        </div>

        {connectError && (
          <div className="mb-3">
            <ErrorState title="Failed to connect" message={connectError} />
          </div>
        )}

        <ul className="flex flex-col gap-1.5">
          {sorted.map((connection) => {
            const engine = ENGINE_STYLES[connection.engine] ?? ENGINE_FALLBACK
            const EngineIcon = ENGINE_ICON[connection.engine] ?? IconDatabase
            const environment = connection.environment ?? DEFAULT_ENVIRONMENT
            const isPending = isConnecting && pendingId === connection.id

            return (
              <li key={connection.id}>
                <button
                  type="button"
                  onClick={() => handleConnect(connection)}
                  disabled={isConnecting}
                  className={cn(
                    'group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-left transition-colors',
                    'hover:border-border-strong hover:bg-surface-elevated/40',
                    'disabled:cursor-not-allowed disabled:opacity-60'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-white/5',
                      engine.bg,
                      engine.iconClass
                    )}
                    aria-hidden
                  >
                    <EngineIcon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-medium leading-tight text-text">
                        {connection.name}
                      </span>
                      <Chip tone={ENVIRONMENT_TONE[environment]}>
                        {ENVIRONMENT_LABEL[environment]}
                      </Chip>
                    </div>
                    <div className="mt-1 truncate font-mono text-xs leading-tight text-text-subtle">
                      {subtitle(connection)}
                    </div>
                  </div>

                  <span className="flex h-7 w-7 shrink-0 items-center justify-center text-text-subtle/60 transition-colors group-hover:text-text">
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

        <div className="mt-4 flex justify-center">
          <Button
            size="sm"
            variant="ghost"
            className="text-text-muted hover:text-text"
            onClick={() => navigate(ROUTES.connections)}
          >
            <IconSettings size={14} />
            Manage connections
          </Button>
        </div>
      </div>
    </div>
  )
}

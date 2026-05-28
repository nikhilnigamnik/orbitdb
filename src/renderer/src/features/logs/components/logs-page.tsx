import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconDownload,
  IconLoader,
  IconRefresh,
  IconSearch,
  IconTrash
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Input } from '@renderer/components/ui/input'
import { Sheet } from '@renderer/components/ui/sheet'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { unwrap } from '@renderer/lib/ipc'
import { buildExportFilename, downloadJson } from '@renderer/lib/export'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { CmdKHint } from '@renderer/features/command-palette/components/cmdk-hint'
import { cn } from '@renderer/lib/utils'
import { formatNumber } from '@renderer/lib/format'
import type { QueryLogEntry } from '@renderer/types'

type ChipTone = React.ComponentProps<typeof Chip>['tone']

const ENGINE_TONE: Record<QueryLogEntry['engine'], ChipTone> = {
  postgres: 'sky',
  mysql: 'orange',
  d1: 'amber'
}

const ENGINE_LABEL: Record<QueryLogEntry['engine'], string> = {
  postgres: 'pg',
  mysql: 'mysql',
  d1: 'd1'
}

export function LogsPage() {
  const { connections } = useConnection()
  const [logs, setLogs] = React.useState<QueryLogEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [filter, setFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'success' | 'error'>('all')
  const [selected, setSelected] = React.useState<QueryLogEntry | null>(null)
  const clearConfirm = useDisclosure(false)

  const load = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const next = await unwrap(window.api.db.listLogs())
      setLogs(next)
    } catch {
      setLogs([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
    const interval = window.setInterval(() => {
      void load()
    }, 4000)
    return () => window.clearInterval(interval)
  }, [load])

  async function handleClear() {
    await unwrap(window.api.db.clearLogs())
    clearConfirm.close()
    await load()
  }

  function handleExport() {
    if (logs.length === 0) return
    downloadJson(buildExportFilename(['query-log'], 'json'), logs)
  }

  const connectionName = React.useCallback(
    (id: string) => {
      if (id === '<test>') return 'Test'
      return connections.find((c) => c.id === id)?.name ?? id.slice(0, 8)
    },
    [connections]
  )

  const lowered = filter.trim().toLowerCase()
  const filtered = React.useMemo(() => {
    return logs.filter((entry) => {
      if (statusFilter === 'success' && !entry.success) return false
      if (statusFilter === 'error' && entry.success) return false
      if (!lowered) return true
      return (
        entry.sql.toLowerCase().includes(lowered) ||
        connectionName(entry.connectionId).toLowerCase().includes(lowered)
      )
    })
  }, [logs, lowered, statusFilter, connectionName])

  const errorCount = logs.filter((entry) => !entry.success).length

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-5 py-3">
        <div className="flex min-w-0 flex-col leading-tight">
          <h1 className="text-[13px] font-semibold text-text">Query log</h1>
          <p className="truncate text-[10.5px] text-text-subtle">
            <span className="font-mono text-text-muted">{formatNumber(logs.length)}</span> entr
            {logs.length === 1 ? 'y' : 'ies'}
            {errorCount > 0 && (
              <>
                <span className="text-text-subtle/60"> · </span>
                <span className="text-red-300/80">{errorCount} failed</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <CmdKHint label="Search tables, connections, actions" />
          <Button
            size="sm"
            variant="ghost"
            className="text-text-muted hover:bg-surface-elevated hover:text-text"
            onClick={handleExport}
            disabled={logs.length === 0}
          >
            <IconDownload size={12} />
            Export
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-text-muted hover:bg-surface-elevated hover:text-text"
            onClick={() => void load()}
            disabled={isLoading}
          >
            <IconRefresh size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-text-muted hover:bg-surface-elevated hover:text-red-400"
            onClick={clearConfirm.open}
            disabled={logs.length === 0}
          >
            <IconTrash size={12} />
            Clear
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface/40 px-5 py-2">
        <div className="relative max-w-sm flex-1">
          <IconSearch
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search SQL or connection…"
            className="pl-7 text-xs"
          />
        </div>
        <SlidingTabs
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'success', label: 'Success' },
            { id: 'error', label: 'Error' }
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading && logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-text-subtle">
            <IconLoader stroke={2} size={20} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-subtle">
            <p className="text-[12px]">
              {logs.length === 0 ? 'No queries logged yet' : 'No matches'}
            </p>
            {logs.length === 0 && (
              <p className="text-[10.5px] text-text-subtle/70">
                Run a query and it'll show up here.
              </p>
            )}
          </div>
        ) : (
          filtered.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelected(entry)}
              className="group/entry block w-full cursor-pointer border-b border-border/60 px-5 py-2.5 text-left transition-colors hover:bg-surface-elevated/40"
            >
              <div className="flex items-center gap-2 text-[10.5px]">
                {entry.success ? (
                  <Chip tone="emerald">
                    <IconCheck size={9} />
                    OK
                  </Chip>
                ) : (
                  <Chip tone="rose">
                    <IconAlertTriangle size={9} />
                    Error
                  </Chip>
                )}
                <Chip tone={ENGINE_TONE[entry.engine]}>{ENGINE_LABEL[entry.engine]}</Chip>
                <span className="truncate text-text-muted">
                  {connectionName(entry.connectionId)}
                </span>
                <span className="ml-auto font-mono text-text-subtle">{entry.durationMs} ms</span>
                {entry.rowCount != null && (
                  <span className="text-text-subtle">
                    <span className="font-mono text-text-muted">
                      {formatNumber(entry.rowCount)}
                    </span>{' '}
                    row{entry.rowCount === 1 ? '' : 's'}
                  </span>
                )}
                <span className="text-text-subtle/70">
                  {formatDistanceToNow(new Date(entry.ranAt), { addSuffix: true })}
                </span>
              </div>
              <p
                className={cn(
                  'mt-1 line-clamp-2 font-mono text-[12px] leading-snug',
                  entry.success ? 'text-text' : 'text-red-300/80'
                )}
              >
                {entry.sql.trim() || '—'}
              </p>
            </button>
          ))
        )}
      </div>

      <Sheet
        openSheet={selected !== null}
        setOpenSheet={(open) => {
          if (!open) setSelected(null)
        }}
        side="right"
        sheetContentClassName="sm:max-w-2xl"
        content={
          selected ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 flex-col gap-1 border-b border-border px-4 py-3 pr-12">
                <h2 className="text-[13px] font-semibold text-text">Query detail</h2>
                <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
                  {selected.success ? (
                    <Chip tone="emerald">
                      <IconCheck size={9} />
                      OK
                    </Chip>
                  ) : (
                    <Chip tone="rose">
                      <IconAlertTriangle size={9} />
                      Error
                    </Chip>
                  )}
                  <Chip tone={ENGINE_TONE[selected.engine]}>{ENGINE_LABEL[selected.engine]}</Chip>
                  <span className="text-text-muted">{connectionName(selected.connectionId)}</span>
                  <span className="font-mono text-text-subtle">{selected.durationMs} ms</span>
                  {selected.rowCount != null && (
                    <span className="text-text-subtle">
                      <span className="font-mono text-text-muted">
                        {formatNumber(selected.rowCount)}
                      </span>{' '}
                      row{selected.rowCount === 1 ? '' : 's'}
                    </span>
                  )}
                  <span className="text-text-subtle">
                    {new Date(selected.ranAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10.5px] font-medium uppercase tracking-wide text-text-subtle">
                      SQL
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 text-text-subtle hover:bg-surface-elevated hover:text-text"
                      onClick={() => void navigator.clipboard.writeText(selected.sql)}
                    >
                      <IconCopy size={11} />
                      Copy
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface-elevated/40 p-3 font-mono text-[12px] text-text">
                    {selected.sql}
                  </pre>
                </div>

                {selected.params.length > 0 && (
                  <div>
                    <span className="text-[10.5px] font-medium uppercase tracking-wide text-text-subtle">
                      Params
                    </span>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border bg-surface-elevated/40 p-3 font-mono text-[11.5px] text-text-muted">
                      {JSON.stringify(selected.params, null, 2)}
                    </pre>
                  </div>
                )}

                {selected.error && (
                  <div>
                    <span className="text-[10.5px] font-medium uppercase tracking-wide text-red-400/80">
                      Error
                    </span>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-red-500/20 bg-red-500/5 p-3 font-mono text-[12px] text-red-300/90">
                      {selected.error}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div />
          )
        }
      />

      <ConfirmDialog
        isOpen={clearConfirm.isOpen}
        onClose={clearConfirm.close}
        onConfirm={handleClear}
        title="Clear query log?"
        description="This wipes the in-memory log buffer. Already-running queries will continue to be recorded."
        confirmLabel="Clear log"
        variant="danger"
      />
    </div>
  )
}

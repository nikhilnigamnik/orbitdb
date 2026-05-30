import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconDownload,
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
import { LoadingState } from '@renderer/components/common/loading-state'
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
  const [copied, setCopied] = React.useState(false)
  const copyTimeout = React.useRef<number | null>(null)
  const clearConfirm = useDisclosure(false)

  React.useEffect(() => {
    return () => {
      if (copyTimeout.current != null) window.clearTimeout(copyTimeout.current)
    }
  }, [])

  function copySql() {
    if (!selected) return
    void navigator.clipboard.writeText(selected.sql)
    setCopied(true)
    if (copyTimeout.current != null) window.clearTimeout(copyTimeout.current)
    copyTimeout.current = window.setTimeout(() => setCopied(false), 1200)
  }

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
          <LoadingState />
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-subtle">
            <p className="text-[12px]">
              {logs.length === 0 ? 'No queries logged yet' : 'No matches'}
            </p>
            {logs.length === 0 && (
              <p className="text-[10.5px] text-text-subtle/70">
                {"Run a query and it'll show up here."}
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
              <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3.5 pr-12">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-b ring-1 ring-inset',
                    selected.success
                      ? 'from-emerald-500/20 to-emerald-500/5 text-emerald-200 ring-emerald-500/25 shadow-[inset_0_1px_0_rgba(110,231,183,0.35)]'
                      : 'from-rose-500/20 to-rose-500/5 text-rose-200 ring-rose-500/25 shadow-[inset_0_1px_0_rgba(253,164,175,0.35)]'
                  )}
                >
                  {selected.success ? (
                    <IconCheck size={16} stroke={2} />
                  ) : (
                    <IconAlertTriangle size={16} stroke={2} />
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[14px] font-semibold tracking-tight text-text">
                      Query detail
                    </h2>
                    <Chip tone={ENGINE_TONE[selected.engine]}>{ENGINE_LABEL[selected.engine]}</Chip>
                  </div>
                  <p className="truncate text-[11px] text-text-subtle">
                    {connectionName(selected.connectionId)} ·{' '}
                    {new Date(selected.ranAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4">
                <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-surface-elevated/20">
                  <Stat label="Duration" value={`${selected.durationMs} ms`} />
                  <Stat
                    label="Rows"
                    value={selected.rowCount != null ? formatNumber(selected.rowCount) : '—'}
                    border
                  />
                  <Stat
                    label="Status"
                    value={selected.success ? 'Success' : 'Failed'}
                    valueClassName={selected.success ? 'text-emerald-300' : 'text-rose-300'}
                    border
                  />
                </div>

                <DetailSection label="SQL">
                  <div className="group/sql relative">
                    <button
                      type="button"
                      onClick={copySql}
                      title="Copy SQL"
                      aria-label="Copy SQL"
                      className="absolute right-2 top-2 z-10 flex h-6 cursor-pointer items-center gap-1 rounded-md border border-border bg-surface px-2 text-[10.5px] text-text-subtle opacity-0 transition-all group-hover/sql:opacity-100 hover:bg-surface-elevated hover:text-text"
                    >
                      {copied ? (
                        <IconCheck size={11} className="text-emerald-400" />
                      ) : (
                        <IconCopy size={11} />
                      )}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <pre className="overflow-auto rounded-lg border border-border bg-surface-elevated/40 px-3.5 py-3 pr-14 font-mono text-[12px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-text">
                      {selected.sql.trim() || '—'}
                    </pre>
                  </div>
                </DetailSection>

                {selected.params.length > 0 && (
                  <DetailSection label="Params">
                    <pre className="overflow-auto rounded-lg border border-border bg-surface-elevated/40 px-3.5 py-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-text-muted">
                      {JSON.stringify(selected.params, null, 2)}
                    </pre>
                  </DetailSection>
                )}

                {selected.error && (
                  <DetailSection label="Error" tone="error">
                    <pre className="overflow-auto rounded-lg border border-rose-500/20 bg-rose-500/5 px-3.5 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-rose-200">
                      {selected.error}
                    </pre>
                  </DetailSection>
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

function Stat({
  label,
  value,
  border,
  valueClassName
}: {
  label: string
  value: React.ReactNode
  border?: boolean
  valueClassName?: string
}) {
  return (
    <div className={cn('flex flex-col gap-0.5 px-3 py-2', border && 'border-l border-border')}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-subtle">
        {label}
      </span>
      <span className={cn('font-mono text-[12px] text-text', valueClassName)}>{value}</span>
    </div>
  )
}

function DetailSection({
  label,
  action,
  tone = 'default',
  children
}: {
  label: string
  action?: React.ReactNode
  tone?: 'default' | 'error'
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-6 items-center justify-between">
        <span
          className={cn(
            'text-[10.5px] font-semibold uppercase tracking-wider',
            tone === 'error' ? 'text-rose-400/80' : 'text-text-subtle'
          )}
        >
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

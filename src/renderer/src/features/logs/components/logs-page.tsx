import * as React from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconClock,
  IconCode,
  IconCopy,
  IconDatabase,
  IconDownload,
  IconHash,
  IconListDetails,
  IconPlug,
  IconRefresh,
  IconSearch,
  IconStopwatch,
  IconTrash
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { PageHeader, PageToolbar } from '@renderer/components/layout/page-header'
import { Spinner } from '@renderer/components/ui/spinner'
import { Chip } from '@renderer/components/ui/chip'
import { Input } from '@renderer/components/ui/input'
import { Sheet, SheetTitle } from '@renderer/components/ui/sheet'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { LoadingState } from '@renderer/components/common/loading-state'
import { useToast } from '@renderer/components/ui/toast'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { buildExportFilename, downloadJson } from '@renderer/lib/export'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { cn } from '@renderer/lib/utils'
import { formatNumber } from '@renderer/lib/format'
import type { QueryLogEntry } from '@renderer/types'

import { formatExactTime, formatShortAgo } from '../lib/relative-time'

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

// One template shared by the header and every row, so the columns line up
// without a <table> - each row is a button, which a <tr> cannot be.
const POLL_INTERVAL_MS = 4000

/**
 * The buffer is newest-first and capped, so a new entry either grows it or
 * pushes the oldest out - either way the head or the length moves.
 */
function logSignature(logs: QueryLogEntry[]): string {
  return `${logs.length}:${logs[0]?.id ?? ''}`
}

const LOG_GRID =
  'grid grid-cols-[96px_minmax(240px,1fr)_minmax(120px,180px)_96px_80px_112px_112px] items-stretch'

export function LogsPage() {
  const { connections } = useConnection()
  const toast = useToast()
  const [logs, setLogs] = React.useState<QueryLogEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [filter, setFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'success' | 'error'>('all')
  // Introspection outnumbers user queries by a wide margin - pragmas, column
  // lookups, the pagination count - so the useful view is the default one.
  const [originFilter, setOriginFilter] = React.useState<'user' | 'all'>('user')
  const [selected, setSelected] = React.useState<QueryLogEntry | null>(null)
  const [copied, setCopied] = React.useState(false)
  const copyTimeout = React.useRef<number | null>(null)
  const clearConfirm = useDisclosure(false)

  React.useEffect(() => {
    return () => {
      if (copyTimeout.current != null) window.clearTimeout(copyTimeout.current)
    }
  }, [])

  async function copySql() {
    if (!selected) return
    try {
      await navigator.clipboard.writeText(selected.sql)
    } catch (err) {
      toast.error('Could not copy the SQL', { description: errorMessage(err) })
      return
    }
    setCopied(true)
    if (copyTimeout.current != null) window.clearTimeout(copyTimeout.current)
    copyTimeout.current = window.setTimeout(() => setCopied(false), 1200)
  }

  const lastSignature = React.useRef<string | null>(null)
  const load = React.useCallback(async ({ isSilent = false }: { isSilent?: boolean } = {}) => {
    // The poll is silent: toggling the spinner on every tick re-rendered the
    // whole list twice even when nothing had been logged.
    if (!isSilent) setIsLoading(true)
    try {
      const next = await unwrap(window.api.db.listLogs())
      const signature = logSignature(next)
      if (signature === lastSignature.current) return
      lastSignature.current = signature
      setLogs(next)
    } catch {
      lastSignature.current = null
      setLogs([])
    } finally {
      if (!isSilent) setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
    const interval = window.setInterval(() => {
      void load({ isSilent: true })
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [load])

  async function handleClear() {
    try {
      await unwrap(window.api.db.clearLogs())
    } catch (err) {
      toast.error('Could not clear the query log', { description: errorMessage(err) })
      return
    }
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
      if (originFilter === 'user' && entry.origin !== 'user') return false
      if (statusFilter === 'success' && !entry.success) return false
      if (statusFilter === 'error' && entry.success) return false
      if (!lowered) return true
      return (
        entry.sql.toLowerCase().includes(lowered) ||
        connectionName(entry.connectionId).toLowerCase().includes(lowered)
      )
    })
  }, [logs, lowered, statusFilter, originFilter, connectionName])

  const errorCount = logs.filter((entry) => !entry.success).length

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <PageHeader
        breadcrumbs={[{ label: 'Query log', icon: <IconListDetails /> }]}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={logs.length === 0}>
              <IconDownload size={14} className="text-text-subtle" />
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={isLoading}>
              {isLoading ? (
                <Spinner size={14} className="text-current" />
              ) : (
                <IconRefresh size={14} className="text-text-subtle" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              variant="subtle"
              className="hover:text-danger"
              onClick={clearConfirm.open}
              disabled={logs.length === 0}
            >
              <IconTrash size={14} />
              Clear
            </Button>
          </>
        }
      />

      <PageToolbar>
        <div className="relative w-full max-w-xs">
          <IconSearch
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-subtle"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search SQL or connection…"
            className="pl-8"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SlidingTabs
            tabs={[
              { id: 'user', label: 'Yours' },
              { id: 'all', label: 'Everything' }
            ]}
            value={originFilter}
            onChange={setOriginFilter}
          />
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
      </PageToolbar>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading && logs.length === 0 ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-surface-elevated">
              <IconListDetails size={20} className="text-text-subtle" />
            </div>
            <p className="text-sm font-medium text-text">
              {logs.length === 0 ? 'No queries logged yet' : 'No matches'}
            </p>
            {logs.length === 0 && (
              <p className="mt-1 text-xs text-text-muted">
                {"Run a query and it'll show up here."}
              </p>
            )}
          </div>
        ) : (
          <div className="min-w-[760px]">
            <div className={cn(LOG_GRID, 'sticky top-0 z-10 h-9 bg-surface')}>
              <HeaderCell icon={<IconCircleCheck size={14} />}>Status</HeaderCell>
              <HeaderCell icon={<IconCode size={14} />}>Query</HeaderCell>
              <HeaderCell icon={<IconPlug size={14} />}>Connection</HeaderCell>
              <HeaderCell icon={<IconDatabase size={14} />}>Engine</HeaderCell>
              <HeaderCell icon={<IconHash size={14} />} isNumeric>
                Rows
              </HeaderCell>
              <HeaderCell icon={<IconStopwatch size={14} />} isNumeric>
                Duration
              </HeaderCell>
              <HeaderCell icon={<IconClock size={14} />}>Ran</HeaderCell>
            </div>
            {filtered.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelected(entry)}
                aria-current={selected?.id === entry.id ? 'true' : undefined}
                className={cn(
                  LOG_GRID,
                  'group/entry h-9 w-full cursor-pointer text-left text-sm transition-colors hover:bg-surface-elevated/60',
                  selected?.id === entry.id && 'bg-surface-active/60'
                )}
              >
                <Cell>
                  {entry.success ? (
                    <Chip tone="emerald">
                      <IconCheck size={12} />
                      Success
                    </Chip>
                  ) : (
                    <Chip tone="rose">
                      <IconAlertTriangle size={12} />
                      Error
                    </Chip>
                  )}
                </Cell>
                <Cell>
                  <span
                    className={cn(
                      'truncate font-mono text-xs',
                      entry.success ? 'text-text' : 'text-danger'
                    )}
                  >
                    {entry.sql.trim() || '-'}
                  </span>
                </Cell>
                <Cell>
                  <span className="truncate font-medium text-text">
                    {connectionName(entry.connectionId)}
                  </span>
                </Cell>
                <Cell>
                  <Chip tone={ENGINE_TONE[entry.engine]}>{ENGINE_LABEL[entry.engine]}</Chip>
                </Cell>
                <Cell isNumeric>
                  {entry.rowCount != null && (
                    <span className="text-text tabular-nums">{formatNumber(entry.rowCount)}</span>
                  )}
                </Cell>
                <Cell isNumeric>
                  <span className="text-text tabular-nums">{entry.durationMs}</span>
                  <span className="ml-1 text-text-subtle">ms</span>
                </Cell>
                <Cell>
                  <span
                    className="truncate text-xs text-text-muted"
                    title={formatExactTime(new Date(entry.ranAt))}
                  >
                    {formatShortAgo(new Date(entry.ranAt))}
                  </span>
                </Cell>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex h-10 shrink-0 items-center gap-2 border-t border-border bg-surface px-4 text-xs text-text-muted">
        <span>
          <span className="text-text tabular-nums">{formatNumber(logs.length)}</span> entr
          {logs.length === 1 ? 'y' : 'ies'}
        </span>
        {errorCount > 0 && (
          <>
            <span className="text-text-subtle/60">·</span>
            <span className="text-danger">
              <span className="tabular-nums">{formatNumber(errorCount)}</span>{' '}
              {errorCount === 1 ? 'error' : 'errors'}
            </span>
          </>
        )}
        {filtered.length !== logs.length && (
          <span className="ml-auto">
            <span className="text-text tabular-nums">{formatNumber(filtered.length)}</span> shown
          </span>
        )}
      </div>

      <Sheet
        openSheet={selected !== null}
        setOpenSheet={(open) => {
          if (!open) setSelected(null)
        }}
        side="right"
        title="Query detail"
        sheetContentClassName="sm:max-w-2xl"
        content={
          selected ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4 pr-12">
                <div
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md',
                    selected.success ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                  )}
                >
                  {selected.success ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
                </div>
                <SheetTitle asChild>
                  <h2 className="text-sm font-semibold text-text">Query detail</h2>
                </SheetTitle>
                <Chip tone={ENGINE_TONE[selected.engine]}>{ENGINE_LABEL[selected.engine]}</Chip>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
                <p className="truncate text-xs text-text-muted">
                  {connectionName(selected.connectionId)} ·{' '}
                  {formatExactTime(new Date(selected.ranAt))}
                </p>

                <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-surface">
                  <Stat label="Duration" value={`${selected.durationMs} ms`} />
                  <Stat
                    label="Rows"
                    value={selected.rowCount != null ? formatNumber(selected.rowCount) : '-'}
                    border
                  />
                  <Stat
                    label="Status"
                    value={selected.success ? 'Success' : 'Error'}
                    valueClassName={selected.success ? 'text-success' : 'text-danger'}
                    border
                  />
                </div>

                <DetailSection label="SQL">
                  <div className="group/sql relative">
                    <button
                      type="button"
                      onClick={() => void copySql()}
                      title="Copy SQL"
                      aria-label="Copy SQL"
                      className="absolute top-2 right-2 z-10 flex h-6 cursor-pointer items-center gap-1 rounded-md bg-control px-2 text-xs font-medium text-text-muted opacity-0 shadow-control transition-all group-hover/sql:opacity-100 hover:bg-control-hover focus-visible:opacity-100 hover:text-text"
                    >
                      {copied ? (
                        <IconCheck size={14} className="text-success" />
                      ) : (
                        <IconCopy size={14} />
                      )}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <pre className="overflow-auto rounded-lg border border-border bg-surface-sunken px-3.5 py-3 pr-14 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere text-text">
                      {selected.sql.trim() || '-'}
                    </pre>
                  </div>
                </DetailSection>

                {selected.params.length > 0 && (
                  <DetailSection label="Params">
                    <pre className="overflow-auto rounded-lg border border-border bg-surface-sunken px-3.5 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere text-text-muted">
                      {JSON.stringify(selected.params, null, 2)}
                    </pre>
                  </DetailSection>
                )}

                {selected.error && (
                  <DetailSection label="Error" tone="error">
                    <pre className="overflow-auto rounded-lg border border-danger/20 bg-danger/5 px-3.5 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere text-danger">
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
        onConfirm={() => void handleClear()}
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
    <div className={cn('flex flex-col gap-0.5 px-3 py-2.5', border && 'border-l border-border')}>
      <span className="text-[12px] font-medium text-text-subtle">{label}</span>
      <span className={cn('text-sm font-medium text-text tabular-nums', valueClassName)}>
        {value}
      </span>
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
            'text-[12px] font-medium',
            tone === 'error' ? 'text-danger' : 'text-text-subtle'
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

function HeaderCell({
  icon,
  isNumeric,
  children
}: {
  icon: React.ReactNode
  isNumeric?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 border-r border-b border-border px-3 text-xs font-medium text-text-muted last:border-r-0',
        isNumeric && 'justify-end'
      )}
    >
      <span className="flex shrink-0 text-text-subtle">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  )
}

function Cell({ isNumeric, children }: { isNumeric?: boolean; children?: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center border-r border-b border-border px-3 last:border-r-0',
        isNumeric && 'justify-end'
      )}
    >
      {children}
    </div>
  )
}

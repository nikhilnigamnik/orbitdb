import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconAlertTriangle, IconArrowRight, IconSearch, IconTable } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogDescription, DialogTitle } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Spinner } from '@renderer/components/ui/spinner'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { formatNumber } from '@renderer/lib/format'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { tableRouteWithFilters } from '@renderer/features/tables/lib/filter-params'
import type { ValueSearchMode, ValueSearchResult } from '@renderer/types'

import { defaultSchema } from './default-schema'

interface ValueSearchDialogProps {
  isOpen: boolean
  onClose: () => void
  connectionId: string
  /** From the URL. Empty before a table is picked, which is a normal way to arrive here. */
  schema: string
}

const MODES: { id: ValueSearchMode; label: string }[] = [
  { id: 'exact', label: 'Exact' },
  { id: 'contains', label: 'Contains' }
]

/** Nothing was searched, so "not found" would be a wrong answer, not a miss. */
function isTotalFailure(result: ValueSearchResult): boolean {
  return result.tablesSearched === 0 && result.failures.length > 0
}

/**
 * Find a value anywhere in the schema.
 *
 * The sweep is the most expensive thing this app asks a database to do, so the
 * dialog is deliberately explicit about it: nothing runs until Search is
 * pressed, it can be abandoned mid-way, and the footer says what was actually
 * looked at rather than implying the whole database was covered.
 */
export function ValueSearchDialog({
  isOpen,
  onClose,
  connectionId,
  schema: schemaFromUrl
}: ValueSearchDialogProps) {
  const navigate = useNavigate()
  const { active } = useConnection()
  const currentDatabase = active?.currentDatabase
  const [resolved, setResolved] = React.useState('')
  const schema = schemaFromUrl || resolved
  const [term, setTerm] = React.useState('')
  const [mode, setMode] = React.useState<ValueSearchMode>('exact')
  const [result, setResult] = React.useState<ValueSearchResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isRunning, setIsRunning] = React.useState(false)
  const searchId = React.useRef<string | null>(null)

  // A result from the last term would sit under a newly typed one and read as
  // its answer.
  React.useEffect(() => {
    setResult(null)
    setError(null)
  }, [term, mode])

  // Opening this from a fresh connection, before any table is picked, is a
  // normal way to arrive - so the schema is resolved here rather than the
  // dialog refusing to work until something has been clicked.
  React.useEffect(() => {
    if (!isOpen || schemaFromUrl) return
    let isCurrent = true
    void (async () => {
      try {
        const schemas = await unwrap(window.api.db.listSchemas(connectionId))
        if (isCurrent) {
          setResolved(
            defaultSchema(
              schemas.map((s) => s.name),
              currentDatabase
            )
          )
        }
      } catch {
        // Leaves the search disabled with its own message rather than replacing
        // the dialog with an error about something the user did not ask for.
      }
    })()
    return () => {
      isCurrent = false
    }
  }, [isOpen, schemaFromUrl, connectionId, currentDatabase])

  async function run() {
    const value = term.trim()
    if (!value || !schema || isRunning) return
    const id = `search-${Date.now()}`
    searchId.current = id
    setIsRunning(true)
    setError(null)
    try {
      const found = await unwrap(
        window.api.db.searchValue({ connectionId, schema, term: value, mode, searchId: id })
      )
      // Ignore a reply that belongs to a search the user has moved on from.
      if (searchId.current === id) setResult(found)
    } catch (err) {
      if (searchId.current === id) setError(errorMessage(err))
    } finally {
      if (searchId.current === id) {
        // Retired here so closing the dialog afterwards cannot register a
        // cancel for a search that already finished - main clears the flag when
        // the sweep returns, so a late one would never be cleared again.
        searchId.current = null
        setIsRunning(false)
      }
    }
  }

  function cancel() {
    if (!isRunning || !searchId.current) return
    void window.api.db.cancelSearch(searchId.current)
  }

  function open(hitSchema: string, table: string, column: string) {
    navigate(
      // The hit's own schema, not the one searched: D1 reports `main` whatever
      // was asked for, and a route built from the request would not resolve.
      tableRouteWithFilters(hitSchema, table, [
        {
          column,
          operator: mode === 'exact' ? '=' : 'ilike',
          value: mode === 'exact' ? term.trim() : `%${term.trim()}%`
        }
      ])
    )
    onClose()
  }

  function close() {
    cancel()
    onClose()
  }

  return (
    <Dialog
      open={isOpen}
      setOpen={(next) => {
        if (!next) close()
      }}
      title="Find a value"
      content={
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex shrink-0 flex-col gap-1 px-5 pt-5 pb-3">
            <DialogTitle asChild>
              <h2 className="text-[15px] font-semibold text-text">Find a value</h2>
            </DialogTitle>
            {/* The cost warning belongs before the click, not during the wait:
                it should inform the decision rather than nag while it runs. */}
            <DialogDescription asChild>
              <p className="text-xs text-text-muted">
                Looks in every text, uuid and enum column of every table.
              </p>
            </DialogDescription>
          </div>

          <div className="flex shrink-0 items-center gap-2 px-5 pb-3">
            <div className="relative min-w-0 flex-1">
              <IconSearch
                size={14}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-subtle"
              />
              <Input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void run()
                }}
                placeholder={schema ? `Find a value anywhere in ${schema}…` : 'Reading schemas…'}
                aria-label="Value to find"
                className="pl-8 font-mono placeholder:font-sans"
              />
            </div>
            <SlidingTabs<ValueSearchMode> tabs={MODES} value={mode} onChange={setMode} />
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5">
            {/* No progress to report - the sweep answers once, at the end - so
                this shows the shape the results will take rather than a bar
                that would have to invent a position. */}
            {isRunning && (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-xs text-text-muted">
                  <Spinner size={12} />
                  <span>
                    Searching <span className="font-mono text-text">{schema}</span>, table by table
                  </span>
                </div>
                <ul className="divide-y divide-border" aria-hidden>
                  {[0.82, 0.64, 0.73, 0.5, 0.68].map((width, i) => (
                    <li key={i} className="flex h-9 items-center gap-3 px-3">
                      <Skeleton className="h-3" style={{ width: `${width * 100}%` }} />
                      <Skeleton className="ml-auto h-3 w-8 shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isRunning && !result && !error && (
              <p className="pb-1 text-xs text-text-subtle">
                Whole tables are scanned, so this can be slow on a large database. You can stop it
                at any point.
              </p>
            )}

            {!isRunning && error && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-xs text-danger">
                <IconAlertTriangle size={14} className="mt-px shrink-0" />
                {error}
              </div>
            )}

            {!isRunning && result && result.hits.length === 0 && !isTotalFailure(result) && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-surface-elevated text-text-subtle">
                  <IconSearch size={20} />
                </span>
                <p className="text-sm font-medium text-text">
                  Not found in {formatNumber(result.tablesSearched)}{' '}
                  {result.tablesSearched === 1 ? 'table' : 'tables'}.
                </p>
              </div>
            )}

            {/* Every table failing is not a clean miss, and saying "not found"
                would be a wrong answer rather than a missing one. */}
            {!isRunning && result && isTotalFailure(result) && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-xs text-danger">
                <IconAlertTriangle size={14} className="mt-px shrink-0" />
                <span>
                  No table could be read, so nothing was actually searched.
                  <span className="mt-1 block font-mono text-[12px] break-words text-danger/80">
                    {result.failures[0].error}
                  </span>
                </span>
              </div>
            )}

            {!isRunning && result && result.hits.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {result.hits.map((hit) => (
                  <li key={`${hit.table}.${hit.column}`}>
                    <button
                      type="button"
                      onClick={() => open(hit.schema, hit.table, hit.column)}
                      className="group flex h-9 w-full cursor-pointer items-center gap-2 px-3 text-left text-sm transition-colors hover:bg-surface-elevated/60"
                    >
                      <IconTable size={16} className="shrink-0 text-text-subtle" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-text">{hit.table}</span>
                        <span className="text-text-subtle">.{hit.column}</span>
                      </span>
                      <span className="shrink-0 text-text-muted tabular-nums">
                        {formatNumber(hit.count)}
                      </span>
                      <IconArrowRight
                        size={14}
                        className="shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!isRunning && result && result.failures.length > 0 && !isTotalFailure(result) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[12px] font-medium text-text-subtle hover:text-text-muted">
                  {result.failures.length} {result.failures.length === 1 ? 'table' : 'tables'} could
                  not be read
                </summary>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {result.failures.map((failure) => (
                    <li key={failure.table} className="font-mono text-[12px] text-text-subtle">
                      {failure.table}: {failure.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3 px-5 py-4">
            <p className="min-w-0 flex-1 text-[12px] text-text-subtle">
              {result && (
                <>
                  {formatNumber(result.columnsSearched)} columns across{' '}
                  {formatNumber(result.tablesSearched)} tables
                  {result.wasCancelled && ' · stopped early, so this is partial'}
                  {result.tablesSkipped > 0 &&
                    ` · ${formatNumber(result.tablesSkipped)} largest tables not searched`}
                  {result.failures.length > 0 &&
                    ` · ${result.failures.length} could not be read (${result.failures[0].table}${result.failures.length > 1 ? ' and others' : ''})`}
                </>
              )}
            </p>
            <Button variant="outline" onClick={close}>
              Close
            </Button>
            {isRunning ? (
              <Button variant="outline" onClick={cancel}>
                Stop
              </Button>
            ) : (
              <Button onClick={() => void run()} disabled={!term.trim() || !schema}>
                Search
              </Button>
            )}
          </div>
        </div>
      }
    />
  )
}

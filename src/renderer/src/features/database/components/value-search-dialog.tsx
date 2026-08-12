import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconAlertTriangle, IconArrowRight, IconSearch } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Spinner } from '@renderer/components/ui/spinner'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { formatNumber } from '@renderer/lib/format'
import { tableRouteWithFilters } from '@renderer/features/tables/lib/filter-params'
import type { ValueSearchMode, ValueSearchResult } from '@renderer/types'

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
        if (isCurrent && schemas[0]) setResolved(schemas[0].name)
      } catch {
        // Leaves the search disabled with its own message rather than replacing
        // the dialog with an error about something the user did not ask for.
      }
    })()
    return () => {
      isCurrent = false
    }
  }, [isOpen, schemaFromUrl, connectionId])

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

  return (
    <Dialog
      open={isOpen}
      setOpen={(next) => {
        if (!next) {
          cancel()
          onClose()
        }
      }}
      content={
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
            <IconSearch size={14} className="shrink-0 text-text-subtle" />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run()
              }}
              placeholder={schema ? `Find a value anywhere in ${schema}…` : 'Reading schemas…'}
              aria-label="Value to find"
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-text outline-none placeholder:font-sans placeholder:text-text-subtle"
            />
            <SlidingTabs<ValueSearchMode> tabs={MODES} value={mode} onChange={setMode} />
            {isRunning ? (
              <Button size="sm" variant="ghost" onClick={cancel}>
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={() => void run()} disabled={!term.trim() || !schema}>
                Search
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {/* No progress to report - the sweep answers once, at the end - so
                this shows the shape the results will take rather than a bar
                that would have to invent a position. */}
            {isRunning && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
                  <Spinner size={12} />
                  <span>
                    Searching <span className="font-mono text-text">{schema}</span>, table by table
                  </span>
                </div>
                <ul className="divide-y divide-border/60" aria-hidden>
                  {[0.82, 0.64, 0.73, 0.5, 0.68].map((width, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <Skeleton className="h-3" style={{ width: `${width * 100}%` }} />
                      <Skeleton className="ml-auto h-3 w-8 shrink-0" />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* The cost warning belongs before the click, not during the wait:
                it should inform the decision rather than nag while it runs. */}
            {!isRunning && !result && !error && (
              <div className="flex flex-col gap-1.5 px-3 py-6 text-center">
                <p className="text-xs text-text-muted">
                  Looks in every text, uuid and enum column of every table.
                </p>
                <p className="text-[11px] text-text-subtle">
                  Whole tables are scanned, so this can be slow on a large database. You can stop it
                  at any point.
                </p>
              </div>
            )}

            {!isRunning && error && (
              <div className="flex items-start gap-2 px-3 py-4 text-xs text-danger">
                <IconAlertTriangle size={13} className="mt-px shrink-0" />
                {error}
              </div>
            )}

            {!isRunning && result && result.hits.length === 0 && !isTotalFailure(result) && (
              <p className="px-3 py-6 text-center text-xs text-text-subtle">
                Not found in {formatNumber(result.tablesSearched)}{' '}
                {result.tablesSearched === 1 ? 'table' : 'tables'}.
              </p>
            )}

            {/* Every table failing is not a clean miss, and saying "not found"
                would be a wrong answer rather than a missing one. */}
            {!isRunning && result && isTotalFailure(result) && (
              <div className="flex items-start gap-2 px-3 py-4 text-xs text-danger">
                <IconAlertTriangle size={13} className="mt-px shrink-0" />
                <span>
                  No table could be read, so nothing was actually searched.
                  <span className="mt-1 block font-mono text-[11px] break-words text-danger/80">
                    {result.failures[0].error}
                  </span>
                </span>
              </div>
            )}

            {!isRunning && result && result.failures.length > 0 && !isTotalFailure(result) && (
              <details className="border-t border-border/60 px-3 py-2">
                <summary className="cursor-pointer text-[11px] text-text-subtle">
                  {result.failures.length} {result.failures.length === 1 ? 'table' : 'tables'} could
                  not be read
                </summary>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {result.failures.map((failure) => (
                    <li key={failure.table} className="font-mono text-[10px] text-text-subtle">
                      {failure.table}: {failure.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {!isRunning && result && result.hits.length > 0 && (
              <ul className="divide-y divide-border/60">
                {result.hits.map((hit) => (
                  <li key={`${hit.table}.${hit.column}`}>
                    <button
                      type="button"
                      onClick={() => open(hit.schema, hit.table, hit.column)}
                      className="group flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-elevated/50"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">
                        {hit.table}
                        <span className="text-text-subtle">.{hit.column}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                        {formatNumber(hit.count)}
                      </span>
                      <IconArrowRight
                        size={12}
                        className="shrink-0 text-accent-text opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {result && (
            <div className="shrink-0 border-t border-border px-3 py-2">
              <p className="text-[11px] text-text-subtle">
                {formatNumber(result.columnsSearched)} columns across{' '}
                {formatNumber(result.tablesSearched)} tables
                {result.wasCancelled && ' · stopped early, so this is partial'}
                {result.tablesSkipped > 0 &&
                  ` · ${formatNumber(result.tablesSkipped)} largest tables not searched`}
                {result.failures.length > 0 &&
                  ` · ${result.failures.length} could not be read (${result.failures[0].table}${result.failures.length > 1 ? ' and others' : ''})`}
              </p>
            </div>
          )}
        </div>
      }
    />
  )
}

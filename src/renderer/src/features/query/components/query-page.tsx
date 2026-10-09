import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconHistory,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlug,
  IconTrash,
  IconSparkles,
  IconTerminal2,
  IconBulb
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Kbd } from '@renderer/components/ui/kbd'
import { Sheet } from '@renderer/components/ui/sheet'
import { EmptyState } from '@renderer/components/common/empty-state'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { unwrap } from '@renderer/lib/ipc'
import { useToast } from '@renderer/components/ui/toast'
import { cn } from '@renderer/lib/utils'
import { ROUTES } from '@renderer/config/routes'
import { DEFAULT_QUERY } from '@renderer/config/site'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { findDestructiveStatements } from '@renderer/lib/sql-danger'
import { errorMessage } from '@renderer/lib/errors'
import type { QueryResult, SavedQuery, SavedQueryPatch } from '@renderer/types'
import { SqlEditor } from './sql-editor'
import { QueryResults } from './query-results'
import { AiPrompt } from './ai-prompt'
import { QueryLibrarySheet } from './query-library-sheet'
import { ExplainQuerySheet } from './explain-query-sheet'
import { useSqlSchema } from '../hooks/use-sql-schema'
import { useQueryAi, type FailedRun } from '../hooks/use-query-ai'
import { hasSqlBody } from '../lib/sql-text'

const MIN_PANEL_PCT = 15
const MAX_PANEL_PCT = 85

function draftKey(connectionId: string): string {
  return `orbitdb:query-draft:${connectionId}`
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private mode or quota - the draft just won't outlive the session
  }
}

export function QueryPage() {
  const navigate = useNavigate()
  const { active, current } = useConnection()
  const connectionId = active?.connectionId ?? ''
  const engine = current?.engine ?? 'postgres'
  const toast = useToast()
  const [sql, setSql] = React.useState('')
  const completionSchema = useSqlSchema(connectionId)
  const [result, setResult] = React.useState<QueryResult | null>(null)
  const [isRunning, setIsRunning] = React.useState(false)
  const runningQueryIdRef = React.useRef<string | null>(null)
  const [queries, setQueries] = React.useState<SavedQuery[]>([])
  const [pendingRun, setPendingRun] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [isAiOpen, setIsAiOpen] = React.useState(false)
  // Only a run the database rejected; an AI failure shown in the same pane is
  // not something "Fix with AI" could act on.
  const [failedRun, setFailedRun] = React.useState<FailedRun | null>(null)
  const ai = useQueryAi({
    connectionId,
    sql,
    setSql,
    setResult: (next) => {
      setFailedRun(null)
      setResult(next)
    }
  })
  const [editorPct, setEditorPct] = React.useState(50)
  const [isDragging, setIsDragging] = React.useState(false)
  const splitRef = React.useRef<HTMLDivElement>(null)

  // The draft stays in localStorage: it is the unsaved text of one window, and
  // has no meaning outside the session that typed it. History does not - it
  // lives in main, next to the other stores.
  React.useEffect(() => {
    if (!connectionId) return
    setSql(readJson(draftKey(connectionId), DEFAULT_QUERY[engine]))
  }, [connectionId, engine])

  React.useEffect(() => {
    if (!connectionId) return
    writeJson(draftKey(connectionId), sql)
  }, [connectionId, sql])

  const loadQueries = React.useCallback(async () => {
    if (!connectionId) return
    try {
      setQueries(await unwrap(window.api.queries.list(connectionId)))
    } catch (err) {
      toast.error('Could not load saved queries', { description: errorMessage(err) })
    }
  }, [connectionId, toast])

  React.useEffect(() => {
    void loadQueries()
  }, [loadQueries])

  React.useEffect(() => {
    if (!isDragging) return
    function handleMove(e: MouseEvent) {
      const container = splitRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const pct = ((e.clientY - rect.top) / rect.height) * 100
      setEditorPct(Math.min(MAX_PANEL_PCT, Math.max(MIN_PANEL_PCT, pct)))
    }
    function handleUp() {
      setIsDragging(false)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging])

  if (!active) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader breadcrumbs={[{ label: 'SQL editor', icon: <IconTerminal2 /> }]} />
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<IconPlug size={20} />}
            title="No active connection"
            description="Connect to a database first to run queries."
            action={
              <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.connections)}>
                Go to connections
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  async function executeSql(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const queryId = crypto.randomUUID()
    runningQueryIdRef.current = queryId
    setIsRunning(true)
    try {
      const queryResult = await unwrap(
        window.api.db.runQuery({ connectionId, sql: trimmed, queryId })
      )
      setResult(queryResult)
      setFailedRun(
        queryResult.success ? null : { sql: trimmed, error: queryResult.error ?? 'Query failed' }
      )
      await recordRun(trimmed, queryResult.durationMs, queryResult.success)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setFailedRun({ sql: trimmed, error: message })
      setResult({
        success: false,
        error: message,
        rows: [],
        fields: [],
        rowCount: null,
        command: null,
        durationMs: 0,
        truncated: false
      })
    } finally {
      setIsRunning(false)
      runningQueryIdRef.current = null
    }
  }

  /** Bookkeeping must never cost the user their result, so a failed write is logged and dropped. */
  async function recordRun(sql: string, durationMs: number, success: boolean) {
    try {
      await unwrap(window.api.queries.record({ connectionId, sql, durationMs, success }))
      await loadQueries()
    } catch (err) {
      console.error('Failed to record query', err)
    }
  }

  async function patchQuery(query: SavedQuery, patch: SavedQueryPatch) {
    try {
      await unwrap(window.api.queries.update(query.id, patch))
      await loadQueries()
    } catch (err) {
      toast.error('Could not update the query', { description: errorMessage(err) })
    }
  }

  async function removeQuery(query: SavedQuery) {
    try {
      await unwrap(window.api.queries.delete(query.id))
      await loadQueries()
    } catch (err) {
      toast.error('Could not delete the query', { description: errorMessage(err) })
    }
  }

  async function clearHistory() {
    try {
      await unwrap(window.api.queries.clearHistory(connectionId))
      await loadQueries()
    } catch (err) {
      toast.error('Could not clear history', { description: errorMessage(err) })
    }
  }

  /**
   * The only way a query reaches the database. Destructive statements stop for
   * confirmation first - deleting a single row asks twice, so `delete from
   * users` should at least ask once.
   */
  function requestRun(text: string) {
    if (findDestructiveStatements(text).length > 0) {
      setPendingRun(text)
      return
    }
    void executeSql(text)
  }

  function runQuery() {
    requestRun(sql)
  }

  async function cancelRunningQuery() {
    const queryId = runningQueryIdRef.current
    if (!queryId || !active) return
    try {
      await unwrap(window.api.db.cancelQuery(active.connectionId, queryId))
    } catch {
      // best effort; the run() promise will surface the cancellation error
    }
  }

  async function handleAiGenerate(prompt: string, isRevision: boolean) {
    // Closed either way: on success the editor holds the answer, on failure the
    // results pane holds the error.
    await ai.generate(prompt, isRevision)
    setIsAiOpen(false)
  }

  const connectionLabel = current?.name ?? active.currentDatabase

  return (
    <div className="flex h-full flex-col bg-surface">
      <PageHeader
        breadcrumbs={[{ label: connectionLabel }, { label: 'SQL editor', icon: <IconTerminal2 /> }]}
        titleAdornment={
          <span className="truncate text-[12px] text-text-subtle">
            <span>{active.currentDatabase}</span>
            <span className="text-text-subtle/60"> · </span>
            <span>{active.currentUser}</span>
          </span>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              className={cn(isAiOpen && 'bg-surface-elevated')}
              onClick={() => setIsAiOpen((open) => !open)}
            >
              <IconSparkles size={14} className="text-accent-text" />
              Ask AI
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void ai.explain()}
              disabled={!hasSqlBody(sql)}
              title="Explain the query in the editor"
            >
              <IconBulb size={14} className="text-text-subtle" />
              Explain
            </Button>
            <Sheet
              openSheet={historyOpen}
              setOpenSheet={setHistoryOpen}
              side="right"
              title="Queries"
              description="Saved queries and recent runs for this connection"
              sheetContentClassName="bg-surface"
              content={
                <QueryLibrarySheet
                  queries={queries}
                  onPick={(picked) => {
                    setSql(picked)
                    setHistoryOpen(false)
                  }}
                  onToggleStar={(query) => void patchQuery(query, { isStarred: !query.isStarred })}
                  onRename={(query, name) => void patchQuery(query, { name })}
                  onDelete={(query) => void removeQuery(query)}
                  onClearHistory={() => void clearHistory()}
                />
              }
            >
              <Button
                size="sm"
                variant="outline"
                className={cn(historyOpen && 'bg-surface-elevated')}
              >
                <IconHistory size={14} className="text-text-subtle" />
                Queries
                {queries.length > 0 && (
                  <span className="ml-0.5 text-[12px] text-text-subtle tabular-nums">
                    {queries.length}
                  </span>
                )}
              </Button>
            </Sheet>
            <Button size="sm" variant="subtle" onClick={() => setSql('')} disabled={!sql}>
              <IconTrash size={14} />
              Clear
            </Button>
            {isRunning ? (
              <Button size="sm" variant="destructive" onClick={cancelRunningQuery}>
                <IconPlayerStop size={14} />
                Cancel
              </Button>
            ) : (
              <Button size="sm" onClick={runQuery} disabled={sql.trim() === ''}>
                <IconPlayerPlay size={14} />
                Run
                <Kbd tone="accent" className="ml-0.5">
                  ⌘↵
                </Kbd>
              </Button>
            )}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div ref={splitRef} className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 overflow-hidden bg-surface" style={{ height: `${editorPct}%` }}>
            <SqlEditor
              value={sql}
              onChange={setSql}
              onSubmit={(text) => requestRun(text)}
              disabled={isRunning}
              engine={engine}
              schema={completionSchema}
            />
          </div>

          {/* A hairline that is easier to grab than it looks: the ::before
              widens the hit area to 9px without drawing anything. */}
          <div
            onMouseDown={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDoubleClick={() => setEditorPct(50)}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize editor"
            aria-valuenow={Math.round(editorPct)}
            aria-valuemin={MIN_PANEL_PCT}
            aria-valuemax={MAX_PANEL_PCT}
            tabIndex={0}
            onKeyDown={(e) => {
              // Arrow keys give the split to anyone not using a mouse.
              const step = e.key === 'ArrowUp' ? -4 : e.key === 'ArrowDown' ? 4 : 0
              if (step === 0) return
              e.preventDefault()
              setEditorPct((pct) => Math.min(MAX_PANEL_PCT, Math.max(MIN_PANEL_PCT, pct + step)))
            }}
            className={cn(
              "relative z-10 h-px shrink-0 cursor-row-resize bg-border outline-none transition-colors before:absolute before:inset-x-0 before:-top-1 before:-bottom-1 before:content-[''] hover:bg-accent/50 focus-visible:bg-accent",
              isDragging && 'bg-accent'
            )}
          />

          <div className="min-h-0 flex-1 overflow-hidden">
            <QueryResults
              result={result}
              isRunning={isRunning}
              onFixWithAi={failedRun ? () => void ai.fix(failedRun) : undefined}
              isFixing={ai.isFixing}
            />
          </div>
        </div>
      </div>

      <AiPrompt
        open={isAiOpen}
        onOpenChange={setIsAiOpen}
        onSubmit={(prompt, isRevision) => void handleAiGenerate(prompt, isRevision)}
        isGenerating={ai.isGenerating}
        canRevise={hasSqlBody(sql)}
      />

      <ExplainQuerySheet explanation={ai.explanation} onClose={ai.closeExplanation} />

      <ConfirmDialog
        isOpen={pendingRun != null}
        onClose={() => setPendingRun(null)}
        onConfirm={() => {
          const text = pendingRun
          setPendingRun(null)
          if (text) void executeSql(text)
        }}
        title="Run this destructive query?"
        description={
          pendingRun
            ? `${findDestructiveStatements(pendingRun)
                .map((s) => s.summary)
                .join('. ')}. This cannot be undone.`
            : undefined
        }
        confirmLabel="Run anyway"
        variant="danger"
      />
    </div>
  )
}

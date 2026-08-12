import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconGripHorizontal,
  IconHistory,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlug,
  IconTrash,
  IconSparkles
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
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
import { CmdKHint } from '@renderer/features/command-palette/components/cmdk-hint'
import { errorMessage } from '@renderer/lib/errors'
import type { QueryResult, SavedQuery, SavedQueryPatch } from '@renderer/types'
import { SqlEditor } from './sql-editor'
import { QueryResults } from './query-results'
import { AiPrompt } from './ai-prompt'
import { QueryLibrarySheet } from './query-library-sheet'
import { useSqlSchema } from '../hooks/use-sql-schema'

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
  const [isAiGenerating, setIsAiGenerating] = React.useState(false)
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
      console.error('Failed to read saved queries', err)
    }
  }, [connectionId])

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
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<IconPlug size={24} />}
          title="No active connection"
          description="Connect to a database first to run queries."
          action={
            <Button size="sm" onClick={() => navigate(ROUTES.connections)}>
              Go to connections
            </Button>
          }
        />
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
        window.api.db.runQuery({ connectionId: active!.connectionId, sql: trimmed, queryId })
      )
      setResult(queryResult)
      await recordRun(trimmed, queryResult.durationMs, queryResult.success)
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
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
      await unwrap(
        window.api.queries.record({ connectionId: active!.connectionId, sql, durationMs, success })
      )
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
      await unwrap(window.api.queries.clearHistory(active!.connectionId))
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

  async function handleAiGenerate(prompt: string) {
    if (!active || isAiGenerating) return
    setIsAiGenerating(true)
    try {
      const { sql: generated } = await unwrap(
        window.api.ai.generateSql({ connectionId: active.connectionId, prompt })
      )
      // Put it in the editor rather than running it. The model is told to
      // prefer SELECT, but that is a preference in a prompt - a misread request
      // used to reach the database with nothing in between.
      const replaced = sql
      setSql(generated)
      setIsAiOpen(false)
      // The draft is persisted on every keystroke, so overwriting it puts the
      // old text beyond reach - history only holds queries that were run.
      if (replaced.trim()) {
        toast.info('Replaced the editor contents', {
          action: { label: 'Undo', onClick: () => setSql(replaced) }
        })
      }
    } catch (err) {
      setIsAiOpen(false)
      setResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        rows: [],
        fields: [],
        rowCount: null,
        command: null,
        durationMs: 0,
        truncated: false
      })
    } finally {
      setIsAiGenerating(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface/40 px-5 py-2.5">
        <div className="flex min-w-0 flex-col leading-tight">
          <h1 className="text-xs font-semibold text-text">SQL editor</h1>
          <p className="truncate text-xs text-text-subtle">
            <span className="font-mono text-text-muted">{active.currentDatabase}</span>
            <span className="text-text-subtle/60"> · </span>
            <span>{active.currentUser}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <CmdKHint variant="input" label="Search tables, connections, actions" />
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'text-text-muted hover:bg-surface-elevated hover:text-text',
              isAiOpen && 'bg-surface-elevated text-text'
            )}
            onClick={() => setIsAiOpen((open) => !open)}
          >
            <IconSparkles size={12} className="text-accent-text" />
            Ask AI
          </Button>
          <Sheet
            openSheet={historyOpen}
            setOpenSheet={setHistoryOpen}
            side="right"
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
              variant="ghost"
              className={cn(
                'text-text-muted hover:bg-surface-elevated hover:text-text',
                historyOpen && 'bg-surface-elevated text-text'
              )}
            >
              <IconHistory size={12} />
              Queries
              {queries.length > 0 && (
                <span className="ml-0.5 rounded bg-surface px-1 py-0 font-mono text-xs text-text-subtle">
                  {queries.length}
                </span>
              )}
            </Button>
          </Sheet>
          <Button
            size="sm"
            variant="ghost"
            className="text-text-muted hover:bg-surface-elevated hover:text-text"
            onClick={() => setSql('')}
            disabled={!sql}
          >
            <IconTrash size={12} />
            Clear
          </Button>
          {isRunning ? (
            <Button
              size="sm"
              className="bg-danger-fill text-white shadow-[inset_0_-2px_0_0_var(--color-danger-shade),0_1px_3px_0_rgba(0,0,0,0.4)] hover:bg-danger hover:shadow-none active:shadow-none"
              onClick={cancelRunningQuery}
            >
              <IconPlayerStop size={12} />
              Cancel
            </Button>
          ) : (
            <Button size="sm" onClick={runQuery} disabled={sql.trim() === ''}>
              <IconPlayerPlay size={12} />
              Run
              <Kbd tone="accent" className="ml-1">
                ⌘↵
              </Kbd>
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div ref={splitRef} className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 overflow-hidden" style={{ height: `${editorPct}%` }}>
            <SqlEditor
              value={sql}
              onChange={setSql}
              onSubmit={(text) => requestRun(text)}
              disabled={isRunning}
              engine={engine}
              schema={completionSchema}
            />
          </div>

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
              'group/handle relative flex h-3 shrink-0 cursor-row-resize items-center justify-center border-y border-border bg-surface outline-none transition-colors focus-visible:bg-accent/20',
              isDragging && 'hover:bg-surface-elevated'
            )}
          >
            <IconGripHorizontal
              stroke={2}
              size={14}
              className={cn(
                'pointer-events-none transition-colors',
                isDragging ? 'text-text' : 'text-text-subtle group-hover/handle:text-text'
              )}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <QueryResults result={result} isRunning={isRunning} />
          </div>
        </div>
      </div>

      <AiPrompt
        open={isAiOpen}
        onOpenChange={setIsAiOpen}
        onSubmit={handleAiGenerate}
        isGenerating={isAiGenerating}
      />

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

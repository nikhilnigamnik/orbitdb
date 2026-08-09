import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconClock,
  IconGripHorizontal,
  IconHistory,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlug,
  IconTrash,
  IconSparkles
} from '@tabler/icons-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@renderer/components/ui/button'
import { Kbd } from '@renderer/components/ui/kbd'
import { Sheet } from '@renderer/components/ui/sheet'
import { EmptyState } from '@renderer/components/common/empty-state'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import { ROUTES } from '@renderer/config/routes'
import { CmdKHint } from '@renderer/features/command-palette/components/cmdk-hint'
import type { QueryResult } from '@renderer/types'
import { SqlEditor } from './sql-editor'
import { QueryResults } from './query-results'
import { AiPrompt } from './ai-prompt'

interface HistoryEntry {
  id: string
  sql: string
  ranAt: string
  durationMs: number
  success: boolean
}

const MIN_PANEL_PCT = 15
const MAX_PANEL_PCT = 85

export function QueryPage() {
  const navigate = useNavigate()
  const { active } = useConnection()
  const [sql, setSql] = React.useState('select now();')
  const [result, setResult] = React.useState<QueryResult | null>(null)
  const [isRunning, setIsRunning] = React.useState(false)
  const runningQueryIdRef = React.useRef<string | null>(null)
  const [history, setHistory] = React.useState<HistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [isAiOpen, setIsAiOpen] = React.useState(false)
  const [isAiGenerating, setIsAiGenerating] = React.useState(false)
  const [editorPct, setEditorPct] = React.useState(50)
  const [isDragging, setIsDragging] = React.useState(false)
  const splitRef = React.useRef<HTMLDivElement>(null)

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
            <Button
              size="sm"
              onClick={() => navigate(ROUTES.connections)}
            >
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
      setHistory((prev) =>
        [
          {
            id: crypto.randomUUID(),
            sql: trimmed,
            ranAt: new Date().toISOString(),
            durationMs: queryResult.durationMs,
            success: queryResult.success
          },
          ...prev
        ].slice(0, 50)
      )
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

  function runQuery() {
    void executeSql(sql)
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
      setSql(generated)
      setIsAiOpen(false)
      await executeSql(generated)
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
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 pr-12">
                  <div className="flex items-center gap-1.5">
                    <IconHistory size={12} className="text-text-subtle" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      History
                    </span>
                    {history.length > 0 && (
                      <span className="rounded bg-surface-elevated px-1 py-0 font-mono text-xs text-text-subtle">
                        {history.length}
                      </span>
                    )}
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-text-subtle hover:bg-surface-elevated hover:text-danger"
                    onClick={() => setHistory([])}
                    disabled={history.length === 0}
                    aria-label="Clear history"
                  >
                    <IconTrash size={12} />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                      <IconClock size={18} className="text-text-subtle/60" />
                      <p className="text-xs text-text-subtle">No history yet</p>
                    </div>
                  ) : (
                    history.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => {
                          setSql(entry.sql)
                          setHistoryOpen(false)
                        }}
                        className="group/entry block w-full cursor-pointer border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-surface-elevated/50"
                      >
                        <p
                          className={cn(
                            'line-clamp-2 font-mono text-xs leading-snug',
                            entry.success ? 'text-text' : 'text-danger'
                          )}
                        >
                          {entry.sql}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-text-subtle">
                          <span className="font-mono">{entry.durationMs} ms</span>
                          <span className="text-text-subtle/60">·</span>
                          <span>
                            {formatDistanceToNow(new Date(entry.ranAt), { addSuffix: true })}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
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
              History
              {history.length > 0 && (
                <span className="ml-0.5 rounded bg-surface px-1 py-0 font-mono text-xs text-text-subtle">
                  {history.length}
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
            <Button
              size="sm"
              onClick={runQuery}
              disabled={sql.trim() === ''}
            >
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
            <SqlEditor value={sql} onChange={setSql} onSubmit={runQuery} disabled={isRunning} />
          </div>

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-valuenow={Math.round(editorPct)}
            aria-valuemin={MIN_PANEL_PCT}
            aria-valuemax={MAX_PANEL_PCT}
            onMouseDown={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDoubleClick={() => setEditorPct(50)}
            className={cn(
              'group/handle relative flex h-3 shrink-0 cursor-row-resize items-center justify-center border-y border-border bg-surface transition-colors',
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
    </div>
  )
}

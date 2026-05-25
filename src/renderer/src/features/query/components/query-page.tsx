import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconPlayerPlay, IconPlug, IconTrash, IconHistory } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/common/empty-state'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { unwrap } from '@renderer/lib/ipc'
import { ROUTES } from '@renderer/config/routes'
import type { QueryResult } from '@renderer/types'
import { SqlEditor } from './sql-editor'
import { QueryResults } from './query-results'

interface HistoryEntry {
  id: string
  sql: string
  ranAt: string
  durationMs: number
  success: boolean
}

export function QueryPage() {
  const navigate = useNavigate()
  const { active } = useConnection()
  const [sql, setSql] = React.useState('select now();')
  const [result, setResult] = React.useState<QueryResult | null>(null)
  const [isRunning, setIsRunning] = React.useState(false)
  const [history, setHistory] = React.useState<HistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = React.useState(false)

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
              className="bg-blue-600 text-white hover:bg-blue-600/90"
              onClick={() => navigate(ROUTES.connections)}
            >
              Go to connections
            </Button>
          }
        />
      </div>
    )
  }

  async function runQuery() {
    const trimmed = sql.trim()
    if (!trimmed) return
    setIsRunning(true)
    try {
      const queryResult = await unwrap(
        window.api.db.runQuery({ connectionId: active!.connectionId, sql: trimmed })
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
        durationMs: 0
      })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div>
          <h1 className="text-sm font-semibold text-neutral-100">SQL editor</h1>
          <p className="text-[11px] text-neutral-500">
            Connected to {active.currentDatabase} as {active.currentUser}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <IconHistory size={14} />
            History ({history.length})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
            onClick={() => setSql('')}
            disabled={!sql}
          >
            <IconTrash size={14} />
            Clear
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 text-white hover:bg-blue-600/90"
            onClick={runQuery}
            disabled={isRunning || sql.trim() === ''}
          >
            <IconPlayerPlay size={14} />
            {isRunning ? 'Running…' : 'Run'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-hidden">
            <SqlEditor value={sql} onChange={setSql} onSubmit={runQuery} disabled={isRunning} />
          </div>
          <div className="h-1/2 flex-1 border-t border-neutral-800">
            <QueryResults result={result} isRunning={isRunning} />
          </div>
        </div>
        {historyOpen && (
          <aside className="w-72 shrink-0 border-l border-neutral-800 bg-neutral-950/40">
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                History
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-neutral-400 hover:bg-neutral-800 hover:text-red-400"
                onClick={() => setHistory([])}
                disabled={history.length === 0}
                title="Clear history"
              >
                <IconTrash size={12} />
              </Button>
            </div>
            <div className="max-h-full overflow-auto">
              {history.length === 0 ? (
                <p className="px-3 py-3 text-xs text-neutral-500">No history yet.</p>
              ) : (
                history.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setSql(entry.sql)}
                    className="block w-full border-b border-neutral-800/60 px-3 py-2 text-left hover:bg-neutral-900/60"
                  >
                    <p
                      className={`line-clamp-2 font-mono text-[11px] ${
                        entry.success ? 'text-neutral-200' : 'text-red-300/80'
                      }`}
                    >
                      {entry.sql}
                    </p>
                    <p className="mt-1 text-[10px] text-neutral-500">{entry.durationMs} ms</p>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

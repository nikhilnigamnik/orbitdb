import * as React from 'react'
import { IconSparkles, IconBulb, IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Sheet } from '@renderer/components/ui/sheet'
import { MarkdownView } from '@renderer/components/common/markdown'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import type { IndexSuggestion } from '@renderer/types'

interface StructureAiProps {
  connectionId: string
  schema: string
  table: string
  /** Whether DDL / data mutations are allowed (false for views). */
  canEdit: boolean
  /** Refresh table details after an index is created or seed data is inserted. */
  onApplied: () => void
}

export function StructureAi({ connectionId, schema, table, canEdit, onApplied }: StructureAiProps) {
  const [panel, setPanel] = React.useState<'explain' | 'indexes' | null>(null)

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated/20 px-4 py-2.5">
        <AiBarButton icon={<IconSparkles size={12} />} onClick={() => setPanel('explain')}>
          Explain table
        </AiBarButton>
        {canEdit && (
          <AiBarButton icon={<IconBulb size={12} />} onClick={() => setPanel('indexes')}>
            Suggest indexes
          </AiBarButton>
        )}
      </div>

      <ExplainSheet
        open={panel === 'explain'}
        onClose={() => setPanel(null)}
        connectionId={connectionId}
        schema={schema}
        table={table}
      />
      <IndexesSheet
        open={panel === 'indexes'}
        onClose={() => setPanel(null)}
        connectionId={connectionId}
        schema={schema}
        table={table}
        onApplied={onApplied}
      />
    </>
  )
}

function AiBarButton({
  icon,
  onClick,
  children
}: {
  icon: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
    >
      {icon}
      {children}
    </button>
  )
}

function PanelHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3 pr-12">
      <span className="shrink-0 ">{icon}</span>
      <h2 className="truncate text-xs font-semibold text-text">{title}</h2>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-4 text-text-subtle">
      {children}
    </div>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="flex shrink-0 items-start gap-2 px-4 py-3 text-xs text-red-300">
      <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function ExplainSheet({
  open,
  onClose,
  connectionId,
  schema,
  table
}: {
  open: boolean
  onClose: () => void
  connectionId: string
  schema: string
  table: string
}) {
  const [isLoading, setIsLoading] = React.useState(false)
  const [text, setText] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setText(null)
    setError(null)
    setIsLoading(true)
    let cancelled = false
    void (async () => {
      try {
        const result = await unwrap(window.api.ai.explainTable({ connectionId, schema, table }))
        if (!cancelled) setText(result.explanation)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, connectionId, schema, table])

  return (
    <Sheet
      openSheet={open}
      setOpenSheet={(o) => !o && onClose()}
      side="right"
      sheetContentClassName="bg-surface"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <PanelHeader icon={<IconSparkles size={15} />} title={`Explain ${table}`} />
          {isLoading ? (
            <Centered>
              <Spinner size={15} className="text-current" />
              <span className="text-xs">Analyzing table…</span>
            </Centered>
          ) : error ? (
            <ErrorLine message={error} />
          ) : (
            <MarkdownView className="min-h-0 flex-1 overflow-auto px-4 py-3.5">
              {text ?? ''}
            </MarkdownView>
          )}
        </div>
      }
    />
  )
}

function IndexesSheet({
  open,
  onClose,
  connectionId,
  schema,
  table,
  onApplied
}: {
  open: boolean
  onClose: () => void
  connectionId: string
  schema: string
  table: string
  onApplied: () => void
}) {
  const [isLoading, setIsLoading] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState<IndexSuggestion[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [applied, setApplied] = React.useState<Record<string, 'applying' | 'done' | string>>({})

  React.useEffect(() => {
    if (!open) return
    setSuggestions([])
    setError(null)
    setApplied({})
    setIsLoading(true)
    let cancelled = false
    void (async () => {
      try {
        const result = await unwrap(window.api.ai.suggestIndexes({ connectionId, schema, table }))
        if (!cancelled) setSuggestions(result.suggestions)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, connectionId, schema, table])

  async function apply(s: IndexSuggestion) {
    setApplied((prev) => ({ ...prev, [s.name]: 'applying' }))
    try {
      await unwrap(
        window.api.db.ddlExecute({
          connectionId,
          schema,
          table,
          operation: {
            kind: 'create-index',
            name: s.name,
            columns: s.columns,
            isUnique: s.isUnique
          }
        })
      )
      setApplied((prev) => ({ ...prev, [s.name]: 'done' }))
      onApplied()
    } catch (err) {
      setApplied((prev) => ({
        ...prev,
        [s.name]: err instanceof Error ? err.message : String(err)
      }))
    }
  }

  return (
    <Sheet
      openSheet={open}
      setOpenSheet={(o) => !o && onClose()}
      side="right"
      sheetContentClassName="bg-surface"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <PanelHeader icon={<IconBulb size={15} />} title={`Index suggestions for ${table}`} />
          {isLoading ? (
            <Centered>
              <Spinner size={15} className="text-current" />
              <span className="text-xs">Analyzing structure…</span>
            </Centered>
          ) : error ? (
            <ErrorLine message={error} />
          ) : suggestions.length === 0 ? (
            <Centered>
              <IconCheck size={15} className="text-emerald-400" />
              <span className="text-xs">No useful indexes are missing.</span>
            </Centered>
          ) : (
            <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-auto">
              {suggestions.map((s) => {
                const state = applied[s.name]
                return (
                  <div key={s.name} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs font-medium text-text">
                          {s.name}
                        </span>
                        {s.isUnique && (
                          <span className="rounded bg-surface-elevated px-1 py-0 text-xs font-semibold uppercase tracking-wider text-text-subtle">
                            Unique
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-text-muted">
                        ({s.columns.join(', ')})
                      </p>
                      <p className="mt-1 text-xs leading-snug text-text-subtle">
                        {s.rationale}
                      </p>
                      {typeof state === 'string' && state !== 'applying' && state !== 'done' && (
                        <p className="mt-1 text-xs text-red-300">{state}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={state === 'applying' || state === 'done'}
                      className={cn(
                        'shrink-0',
                        state === 'done'
                          ? 'text-emerald-400'
                          : 'text-text-muted hover:bg-surface-elevated hover:text-text'
                      )}
                      onClick={() => apply(s)}
                    >
                      {state === 'applying' ? (
                        <Spinner size={12} className="text-current" />
                      ) : state === 'done' ? (
                        <IconCheck size={12} />
                      ) : null}
                      {state === 'done' ? 'Created' : state === 'applying' ? 'Creating…' : 'Create'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      }
    />
  )
}

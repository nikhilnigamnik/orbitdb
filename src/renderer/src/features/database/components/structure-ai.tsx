import * as React from 'react'
import { IconSparkles, IconBulb, IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Spinner } from '@renderer/components/ui/spinner'
import { Sheet } from '@renderer/components/ui/sheet'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { AiKeyRequired, isMissingAiKeyError } from '@renderer/components/common/ai-key-required'
import { LoadingState } from '@renderer/components/common/loading-state'
import { cn } from '@renderer/lib/utils'
import type { IndexSuggestion } from '@renderer/types'

// The markdown renderer (react-markdown and the micromark/mdast/hast stack, about
// 150 KB) is only needed once someone asks for an explanation, so it loads then.
const MarkdownView = React.lazy(async () => ({
  default: (await import('@renderer/components/common/markdown')).MarkdownView
}))

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
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPanel('explain')}>
          <IconSparkles size={14} className="text-text-subtle" />
          Explain table
        </Button>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setPanel('indexes')}>
            <IconBulb size={14} className="text-text-subtle" />
            Suggest indexes
          </Button>
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

function PanelHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 pr-12">
      <span className="flex shrink-0 text-text-subtle">{icon}</span>
      <h2 className="truncate text-sm font-semibold text-text">{title}</h2>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-text-muted">
      {children}
    </div>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="m-4 flex shrink-0 items-start gap-2 rounded-lg border border-danger/15 bg-danger/5 px-3 py-2.5 text-xs text-danger">
      <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0 wrap-break-word">{message}</span>
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
      title={`Explain ${table}`}
      openSheet={open}
      setOpenSheet={(o) => !o && onClose()}
      side="right"
      sheetContentClassName="bg-surface"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <PanelHeader icon={<IconSparkles size={16} />} title={`Explain ${table}`} />
          {isLoading ? (
            <Centered>
              <Spinner size={16} className="text-text-subtle" />
              <span className="text-xs">Analyzing table…</span>
            </Centered>
          ) : isMissingAiKeyError(error) ? (
            <AiKeyRequired onNavigate={onClose} />
          ) : error ? (
            <ErrorLine message={error} />
          ) : (
            <React.Suspense fallback={<LoadingState />}>
              <MarkdownView className="min-h-0 flex-1 overflow-auto p-4">{text ?? ''}</MarkdownView>
            </React.Suspense>
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
  /** The exact statement each suggestion would run, by suggestion name. */
  const [preview, setPreview] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!open) return
    setSuggestions([])
    setError(null)
    setApplied({})
    setPreview({})
    setIsLoading(true)
    let cancelled = false
    void (async () => {
      try {
        const result = await unwrap(window.api.ai.suggestIndexes({ connectionId, schema, table }))
        if (cancelled) return
        setSuggestions(result.suggestions)
        // Every other DDL path in the app shows the statement before running it,
        // and these are a model's guesses - the one place it matters most.
        // ddlPreview builds the SQL without touching the database.
        const previews = await Promise.all(
          result.suggestions.map(async (s) => {
            try {
              return [s.name, await unwrap(window.api.db.ddlPreview(ddlRequest(s)))] as const
            } catch {
              return [s.name, ''] as const
            }
          })
        )
        if (!cancelled) setPreview(Object.fromEntries(previews.filter(([, sql]) => sql)))
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, connectionId, schema, table])

  function ddlRequest(s: IndexSuggestion) {
    return {
      connectionId,
      schema,
      table,
      operation: {
        kind: 'create-index' as const,
        name: s.name,
        columns: s.columns,
        isUnique: s.isUnique
      }
    }
  }

  async function apply(s: IndexSuggestion) {
    setApplied((prev) => ({ ...prev, [s.name]: 'applying' }))
    try {
      await unwrap(window.api.db.ddlExecute(ddlRequest(s)))
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
      title={`Index suggestions for ${table}`}
      openSheet={open}
      setOpenSheet={(o) => !o && onClose()}
      side="right"
      sheetContentClassName="bg-surface"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <PanelHeader icon={<IconBulb size={16} />} title={`Index suggestions for ${table}`} />
          {isLoading ? (
            <Centered>
              <Spinner size={16} className="text-text-subtle" />
              <span className="text-xs">Analyzing structure…</span>
            </Centered>
          ) : isMissingAiKeyError(error) ? (
            <AiKeyRequired onNavigate={onClose} />
          ) : error ? (
            <ErrorLine message={error} />
          ) : suggestions.length === 0 ? (
            <Centered>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-elevated">
                <IconCheck size={20} className="text-success" />
              </div>
              <span className="text-sm font-medium text-text">No useful indexes are missing.</span>
            </Centered>
          ) : (
            <div className="min-h-0 flex-1 divide-y divide-border overflow-auto">
              {suggestions.map((s) => {
                const state = applied[s.name]
                return (
                  <div key={s.name} className="flex flex-col gap-2.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate text-sm font-medium text-text">
                            {s.name}
                          </span>
                          {s.isUnique && <Chip tone="sky">Unique</Chip>}
                        </span>
                        <span className="font-mono text-[12px] text-text-subtle">
                          ({s.columns.join(', ')})
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={state === 'applying' || state === 'done'}
                        className={cn('shrink-0', state === 'done' && 'text-success')}
                        onClick={() => apply(s)}
                      >
                        {state === 'applying' ? (
                          <Spinner size={12} className="text-current" />
                        ) : state === 'done' ? (
                          <IconCheck size={14} />
                        ) : null}
                        {state === 'done'
                          ? 'Created'
                          : state === 'applying'
                            ? 'Creating…'
                            : 'Create'}
                      </Button>
                    </div>

                    <p className="text-xs text-text-muted">{s.rationale}</p>

                    {preview[s.name] && (
                      // Wrapped, not scrolled: a statement you have to drag
                      // sideways to read is not a preview of anything.
                      <pre className="rounded-lg border border-border bg-surface-sunken px-3 py-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-text">
                        {preview[s.name]}
                      </pre>
                    )}
                    {typeof state === 'string' && state !== 'applying' && state !== 'done' && (
                      <p className="text-xs text-danger">{state}</p>
                    )}
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

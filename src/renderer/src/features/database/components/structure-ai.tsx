import * as React from 'react'
import { IconSparkles, IconBulb, IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Spinner } from '@renderer/components/ui/spinner'
import { Sheet } from '@renderer/components/ui/sheet'
import { MarkdownView } from '@renderer/components/common/markdown'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { AiKeyRequired, isMissingAiKeyError } from '@renderer/components/common/ai-key-required'
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
    <div className="flex shrink-0 items-start gap-2 px-4 py-3 text-xs text-danger">
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
          ) : isMissingAiKeyError(error) ? (
            <AiKeyRequired onNavigate={onClose} />
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
        // and these are a model's guesses — the one place it matters most.
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
          ) : isMissingAiKeyError(error) ? (
            <AiKeyRequired onNavigate={onClose} />
          ) : error ? (
            <ErrorLine message={error} />
          ) : suggestions.length === 0 ? (
            <Centered>
              <IconCheck size={15} className="text-success" />
              <span className="text-xs">No useful indexes are missing.</span>
            </Centered>
          ) : (
            <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-auto">
              {suggestions.map((s) => {
                const state = applied[s.name]
                return (
                  <div key={s.name} className="flex flex-col gap-2 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate font-mono text-xs font-medium text-text">
                            {s.name}
                          </span>
                          {s.isUnique && <Chip tone="neutral">Unique</Chip>}
                        </span>
                        <span className="font-mono text-xs text-text-subtle">
                          ({s.columns.join(', ')})
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={state === 'applying' || state === 'done'}
                        className={cn(
                          'shrink-0',
                          state === 'done'
                            ? 'text-success'
                            : 'text-text-muted hover:bg-surface-elevated hover:text-text'
                        )}
                        onClick={() => apply(s)}
                      >
                        {state === 'applying' ? (
                          <Spinner size={12} className="text-current" />
                        ) : state === 'done' ? (
                          <IconCheck size={12} />
                        ) : null}
                        {state === 'done'
                          ? 'Created'
                          : state === 'applying'
                            ? 'Creating…'
                            : 'Create'}
                      </Button>
                    </div>

                    <p className="text-xs leading-relaxed text-text-subtle">{s.rationale}</p>

                    {preview[s.name] && (
                      // Wrapped, not scrolled: a statement you have to drag
                      // sideways to read is not a preview of anything.
                      <pre className="rounded-md border border-border bg-input px-2.5 py-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-text-muted">
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

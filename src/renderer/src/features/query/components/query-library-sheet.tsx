import * as React from 'react'
import { IconClock, IconStar, IconStarFilled, IconTrash } from '@tabler/icons-react'
import { formatDistanceToNow } from 'date-fns'

import { Button } from '@renderer/components/ui/button'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { cn } from '@renderer/lib/utils'
import type { SavedQuery } from '@renderer/types'

import { collapseSql, groupQueries } from '../lib/query-library'

interface QueryLibrarySheetProps {
  queries: SavedQuery[]
  onPick: (sql: string) => void
  onToggleStar: (query: SavedQuery) => void
  onRename: (query: SavedQuery, name: string) => void
  onDelete: (query: SavedQuery) => void
  onClearHistory: () => void
}

export function QueryLibrarySheet({
  queries,
  onPick,
  onToggleStar,
  onRename,
  onDelete,
  onClearHistory
}: QueryLibrarySheetProps) {
  const { saved, recent } = React.useMemo(() => groupQueries(queries), [queries])
  const [pendingDelete, setPendingDelete] = React.useState<SavedQuery | null>(null)
  const [isConfirmingClear, setIsConfirmingClear] = React.useState(false)

  // A history entry is disposable - the next run of the same SQL recreates it -
  // so it goes at once. A saved query is the one thing the user chose to keep,
  // and there is no way back from deleting it.
  function requestDelete(query: SavedQuery) {
    if (query.isStarred) {
      setPendingDelete(query)
      return
    }
    onDelete(query)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4 pr-12">
        <div className="flex items-center gap-2">
          <IconClock size={16} className="text-text-subtle" />
          <span className="text-sm font-semibold text-text">Queries</span>
          {queries.length > 0 && (
            <span className="text-[12px] text-text-subtle tabular-nums">{queries.length}</span>
          )}
        </div>
        <Button
          size="icon-sm"
          variant="subtle"
          className="hover:text-danger"
          onClick={() => setIsConfirmingClear(true)}
          disabled={recent.length === 0}
          title="Clear history - starred queries are kept"
          aria-label="Clear history"
        >
          <IconTrash size={16} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {queries.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-surface-elevated">
              <IconClock size={20} className="text-text-subtle" />
            </div>
            <p className="text-sm font-medium text-text">No queries yet</p>
            <p className="mt-1 max-w-[15rem] text-xs text-text-muted">
              Everything you run lands here. Star one to keep it.
            </p>
          </div>
        ) : (
          <>
            {saved.length > 0 && (
              <Section label="Saved" count={saved.length}>
                {saved.map((query) => (
                  <QueryRow
                    key={query.id}
                    query={query}
                    onPick={onPick}
                    onToggleStar={onToggleStar}
                    onRename={onRename}
                    onDelete={requestDelete}
                  />
                ))}
              </Section>
            )}
            {recent.length > 0 && (
              <Section label="Recent" count={recent.length}>
                {recent.map((query) => (
                  <QueryRow
                    key={query.id}
                    query={query}
                    onPick={onPick}
                    onToggleStar={onToggleStar}
                    onRename={onRename}
                    onDelete={requestDelete}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          const query = pendingDelete
          setPendingDelete(null)
          if (query) onDelete(query)
        }}
        title="Delete this saved query?"
        description={
          pendingDelete
            ? `"${pendingDelete.name?.trim() || collapseSql(pendingDelete.sql)}" will be removed. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={isConfirmingClear}
        onClose={() => setIsConfirmingClear(false)}
        onConfirm={() => {
          setIsConfirmingClear(false)
          onClearHistory()
        }}
        title="Clear query history?"
        description={`${recent.length} recent ${recent.length === 1 ? 'query' : 'queries'} for this connection will be removed. Saved queries are kept.`}
        confirmLabel="Clear history"
        variant="danger"
      />
    </div>
  )
}

function Section({
  label,
  count,
  children
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="sticky top-0 z-10 flex h-8 items-center gap-1.5 border-b border-border bg-surface px-4">
        <span className="text-[12px] font-medium text-text-subtle">{label}</span>
        <span className="text-[12px] text-text-subtle/70 tabular-nums">{count}</span>
      </div>
      {children}
    </div>
  )
}

interface QueryRowProps {
  query: SavedQuery
  onPick: (sql: string) => void
  onToggleStar: (query: SavedQuery) => void
  onRename: (query: SavedQuery, name: string) => void
  onDelete: (query: SavedQuery) => void
}

function QueryRow({ query, onPick, onToggleStar, onRename, onDelete }: QueryRowProps) {
  // Seeded from props rather than driven by them: the field is a draft until it
  // is committed, and a re-render mid-typing would otherwise snap it back.
  const [name, setName] = React.useState(query.name ?? '')
  React.useEffect(() => {
    setName(query.name ?? '')
  }, [query.name])

  function commitName() {
    const next = name.trim()
    if (next === (query.name ?? '')) return
    onRename(query, next)
  }

  return (
    <div className="group/entry relative border-b border-border transition-colors hover:bg-surface-elevated/60">
      {/* A sibling of the preview button, not a child: an input inside a button
          is invalid markup, and a click on it would load the query. */}
      {query.isStarred && (
        <div className="px-4 pt-2.5 pr-16">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
              if (e.key === 'Escape') {
                setName(query.name ?? '')
                e.currentTarget.blur()
              }
            }}
            placeholder="Name this query"
            aria-label="Query name"
            className="-ml-1 w-[calc(100%+0.25rem)] cursor-text rounded-md bg-transparent px-1 text-sm font-medium text-text outline-none placeholder:font-normal placeholder:text-text-subtle hover:bg-control-hover focus:bg-control focus:shadow-control"
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => onPick(query.sql)}
        className={cn(
          'block w-full cursor-pointer px-4 pb-2.5 pr-16 text-left',
          query.isStarred ? 'pt-1' : 'pt-2.5'
        )}
        title={collapseSql(query.sql)}
      >
        <p
          className={cn(
            'line-clamp-2 font-mono text-xs leading-snug',
            query.success ? 'text-text' : 'text-danger',
            query.isStarred && 'text-text-muted'
          )}
        >
          {query.sql}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-text-subtle">
          <span className="tabular-nums">{query.durationMs} ms</span>
          <span className="text-text-subtle/60">·</span>
          <span>{formatDistanceToNow(new Date(query.ranAt), { addSuffix: true })}</span>
        </div>
      </button>

      <div className="absolute top-2 right-3 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/entry:opacity-100">
        <Button
          size="icon-xs"
          variant="subtle"
          className={cn(
            query.isStarred ? 'text-warning hover:text-warning' : 'text-text-subtle hover:text-text'
          )}
          onClick={() => onToggleStar(query)}
          title={query.isStarred ? 'Remove from saved' : 'Save this query'}
          aria-label={query.isStarred ? 'Remove from saved' : 'Save this query'}
        >
          {query.isStarred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        </Button>
        <Button
          size="icon-xs"
          variant="subtle"
          className="text-text-subtle hover:text-danger"
          onClick={() => onDelete(query)}
          title="Delete"
          aria-label="Delete query"
        >
          <IconTrash size={14} />
        </Button>
      </div>
    </div>
  )
}

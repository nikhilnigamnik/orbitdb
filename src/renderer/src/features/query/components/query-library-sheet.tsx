import * as React from 'react'
import { IconClock, IconStar, IconStarFilled, IconTrash, IconX } from '@tabler/icons-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@renderer/components/ui/button'
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 pr-12">
        <div className="flex items-center gap-1.5">
          <IconClock size={12} className="text-text-subtle" />
          <span className="text-xs font-semibold tracking-wide text-text-muted uppercase">
            Queries
          </span>
          {queries.length > 0 && (
            <span className="rounded bg-surface-elevated px-1 py-0 font-mono text-xs text-text-subtle">
              {queries.length}
            </span>
          )}
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-text-subtle hover:bg-surface-elevated hover:text-danger"
          onClick={onClearHistory}
          disabled={recent.length === 0}
          title="Clear history - starred queries are kept"
          aria-label="Clear history"
        >
          <IconTrash size={12} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {queries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <IconClock size={18} className="text-text-subtle/60" />
            <p className="text-xs text-text-subtle">No queries yet</p>
            <p className="max-w-[15rem] text-xs text-text-subtle/70">
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
                    onDelete={onDelete}
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
                    onDelete={onDelete}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
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
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border bg-surface px-3 py-1.5">
        <span className="text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
          {label}
        </span>
        <span className="font-mono text-[10px] text-text-subtle/70">{count}</span>
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
    <div className="group/entry relative border-b border-border/60 transition-colors hover:bg-surface-elevated/50">
      <button
        type="button"
        onClick={() => onPick(query.sql)}
        className="block w-full cursor-pointer px-3 py-2 pr-16 text-left"
        title={collapseSql(query.sql)}
      >
        {query.isStarred && (
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
            // Inside the button, so a click has to be stopped from loading the query.
            onClick={(e) => e.stopPropagation()}
            placeholder="Name this query"
            aria-label="Query name"
            className="mb-1 w-full cursor-text rounded-sm bg-transparent text-xs font-medium text-text outline-none placeholder:font-normal placeholder:text-text-subtle/70 hover:bg-surface-elevated focus:bg-surface-elevated focus:ring-1 focus:ring-accent/40"
          />
        )}
        <p
          className={cn(
            'line-clamp-2 font-mono text-xs leading-snug',
            query.success ? 'text-text' : 'text-danger',
            query.isStarred && 'text-text-muted'
          )}
        >
          {query.sql}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-text-subtle">
          <span className="font-mono">{query.durationMs} ms</span>
          <span className="text-text-subtle/60">·</span>
          <span>{formatDistanceToNow(new Date(query.ranAt), { addSuffix: true })}</span>
        </div>
      </button>

      <div className="absolute top-1.5 right-2 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/entry:opacity-100">
        <Button
          size="icon-xs"
          variant="ghost"
          className={cn(
            'hover:bg-surface-elevated',
            query.isStarred ? 'text-warning' : 'text-text-subtle hover:text-text'
          )}
          onClick={() => onToggleStar(query)}
          title={query.isStarred ? 'Remove from saved' : 'Save this query'}
          aria-label={query.isStarred ? 'Remove from saved' : 'Save this query'}
        >
          {query.isStarred ? <IconStarFilled size={12} /> : <IconStar size={12} />}
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-text-subtle hover:bg-surface-elevated hover:text-danger"
          onClick={() => onDelete(query)}
          title="Delete"
          aria-label="Delete query"
        >
          <IconX size={12} />
        </Button>
      </div>
    </div>
  )
}

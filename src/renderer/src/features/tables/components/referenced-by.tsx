import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArrowUpRight, IconLink } from '@tabler/icons-react'
import { Spinner } from '@renderer/components/ui/spinner'
import { Chip } from '@renderer/components/ui/chip'
import { formatNumber } from '@renderer/lib/format'
import { errorMessage } from '@renderer/lib/errors'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import type { ReferencingKeyInfo, RowFilter } from '@renderer/types'
import { childFilters, childTableLabel } from '../lib/referencing'
import { tableRouteWithFilters } from '../lib/filter-params'

interface ReferencedByProps {
  connectionId: string
  schema: string
  table: string
  /** The parent row being edited. Its values are what the children point at. */
  row: Record<string, unknown>
  /** Called before navigating away, so the host can close itself. */
  onNavigate: () => void
}

interface Link {
  key: ReferencingKeyInfo
  filters: RowFilter[] | null
  /** Null while counting, or when the count failed. */
  count: number | null
}

/**
 * The children that depend on this row. Introspection has always known them -
 * the grid could follow a foreign key outwards but nothing showed what would
 * break if the row went away.
 */
export function ReferencedBy({ connectionId, schema, table, row, onNavigate }: ReferencedByProps) {
  const navigate = useNavigate()
  const [links, setLinks] = React.useState<Link[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let isCurrent = true

    async function load() {
      setLinks(null)
      setError(null)
      let keys: ReferencingKeyInfo[]
      try {
        keys = await unwrap(window.api.db.referencingKeys(connectionId, schema, table))
      } catch (err) {
        if (isCurrent) setError(errorMessage(err))
        return
      }
      if (!isCurrent) return

      const initial: Link[] = keys.map((key) => ({
        key,
        filters: childFilters(key, row),
        count: null
      }))
      setLinks(initial)

      // Counts are separate queries against tables of unknown size, so each one
      // lands on its own rather than holding the list back.
      await Promise.all(
        initial.map(async (link, index) => {
          if (!link.filters) return
          try {
            const count = await unwrap(
              window.api.db.countRows({
                connectionId,
                schema: link.key.schema,
                table: link.key.table,
                filters: link.filters,
                filterJoin: 'and'
              })
            )
            if (!isCurrent) return
            setLinks((prev) =>
              prev ? prev.map((l, i) => (i === index ? { ...l, count } : l)) : prev
            )
          } catch {
            // Leaves the count null - the link still works, which is the point.
          }
        })
      )
    }

    void load()
    return () => {
      isCurrent = false
    }
  }, [connectionId, schema, table, row])

  if (error) {
    return (
      <Panel>
        <p className="px-3 py-2 text-xs text-text-subtle">Could not read relationships: {error}</p>
      </Panel>
    )
  }

  if (links === null) {
    return (
      <Panel>
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-subtle">
          <Spinner size={12} />
          Looking for related rows…
        </div>
      </Panel>
    )
  }

  if (links.length === 0) return null

  return (
    <Panel count={links.length}>
      <div className="divide-y divide-border/60">
        {links.map((link) => {
          const label = childTableLabel(link.key)
          const isLinkable = link.filters != null
          const isCascade = link.key.onDelete.toUpperCase() === 'CASCADE'
          return (
            <button
              key={`${link.key.schema}.${link.key.table}.${link.key.name}`}
              type="button"
              disabled={!isLinkable}
              onClick={() => {
                if (!link.filters) return
                onNavigate()
                navigate(tableRouteWithFilters(link.key.schema, link.key.table, link.filters))
              }}
              className={cn(
                'group/link flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                isLinkable ? 'cursor-pointer hover:bg-surface-elevated/50' : 'cursor-default'
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-mono text-xs text-text">{label}</span>
                <span className="truncate font-mono text-[10px] text-text-subtle">
                  {link.key.columns.join(', ')}
                  {!isLinkable && ' · no value to match'}
                </span>
              </div>
              {/* Worth its own badge: these rows go with the parent, silently. */}
              {isCascade && <Chip tone="rose">cascade</Chip>}
              <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                {link.count == null ? '-' : formatNumber(link.count)}
              </span>
              {isLinkable && (
                <IconArrowUpRight
                  size={12}
                  className="shrink-0 text-accent-text opacity-0 transition-opacity group-hover/link:opacity-100"
                />
              )}
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

function Panel({ count, children }: { count?: number; children: React.ReactNode }) {
  return (
    // `shrink-0` because this renders inside a scrolling flex column: its own
    // `overflow-hidden` drops its automatic minimum size to zero, so without it
    // the panel collapses and clips its links rather than letting them scroll.
    <div className="shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated/20">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
        <IconLink size={11} className="text-text-subtle" />
        <span className="text-[10px] font-semibold tracking-wide text-text-muted uppercase">
          Referenced by
        </span>
        {count != null && (
          <span className="font-mono text-[10px] text-text-subtle/70">{count}</span>
        )}
      </div>
      {children}
    </div>
  )
}

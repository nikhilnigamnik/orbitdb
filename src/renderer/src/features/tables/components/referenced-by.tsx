import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArrowUpRight, IconLink, IconTable } from '@tabler/icons-react'
import { Spinner } from '@renderer/components/ui/spinner'
import { Chip } from '@renderer/components/ui/chip'
import { formatNumber } from '@renderer/lib/format'
import { errorMessage } from '@renderer/lib/errors'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import type { ReferencingKeyInfo, RowFilter } from '@renderer/types'
import { tileColor } from '@renderer/features/database/lib/tile-color'
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
        <p className="px-3 py-2.5 text-xs text-text-muted">Could not read relationships: {error}</p>
      </Panel>
    )
  }

  if (links === null) {
    return (
      <Panel>
        <div className="flex h-11 items-center gap-2 px-3 text-xs text-text-muted">
          <Spinner size={12} />
          Looking for related rows…
        </div>
      </Panel>
    )
  }

  if (links.length === 0) return null

  return (
    <Panel count={links.length}>
      <div className="divide-y divide-border">
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
                'group/link flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                isLinkable ? 'cursor-pointer hover:bg-surface-elevated/60' : 'cursor-default'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white',
                  tileColor(link.key.table)
                )}
              >
                <IconTable size={14} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-text">{label}</span>
                <span className="truncate text-[12px] text-text-subtle">
                  {link.key.columns.join(', ')}
                  {!isLinkable && ' · no value to match'}
                </span>
              </div>
              {/* Worth its own badge: these rows go with the parent, silently. */}
              {isCascade && <Chip tone="rose">cascade</Chip>}
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-surface-elevated px-1.5 text-[12px] font-medium tabular-nums text-text-muted">
                {link.count == null ? '-' : formatNumber(link.count)}
              </span>
              {isLinkable && (
                <IconArrowUpRight
                  size={14}
                  className="shrink-0 text-text-subtle opacity-0 transition-opacity group-hover/link:opacity-100"
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
    <section className="flex shrink-0 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <IconLink size={16} className="text-text-subtle" />
        <h3 className="text-sm font-semibold text-text">Referenced by</h3>
        {count != null && (
          <span className="text-[12px] font-medium tabular-nums text-text-subtle">{count}</span>
        )}
      </div>
      <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-surface">
        {children}
      </div>
    </section>
  )
}

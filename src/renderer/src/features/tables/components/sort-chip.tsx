import * as React from 'react'
import { IconArrowDown, IconArrowUp, IconArrowsSort, IconCheck, IconX } from '@tabler/icons-react'
import { Popover } from '@renderer/components/ui/popover'
import { SlidingHoverList } from '@renderer/components/ui/sliding-hover-list'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { cn } from '@renderer/lib/utils'
import type { ColumnInfo, SortDirection } from '@renderer/types'
import { ColumnTypeIcon } from './column-type-icon'

interface SortChipProps {
  columns: ColumnInfo[]
  orderBy: string | null
  orderDir: SortDirection
  onChange: (orderBy: string | null, orderDir: SortDirection) => void
}

const DIRECTION_TABS: { id: SortDirection; label: string }[] = [
  { id: 'asc', label: 'Ascending' },
  { id: 'desc', label: 'Descending' }
]

/**
 * Attio's Sort control: a dashed chip while nothing is sorted, a white one
 * naming the column once something is. The header arrows still work - this is
 * the same sort, reachable without scrolling to the column.
 */
export function SortChip({ columns, orderBy, orderDir, onChange }: SortChipProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return columns
    return columns.filter((column) => column.name.toLowerCase().includes(query))
  }, [columns, search])

  function pick(column: string) {
    onChange(column, orderBy === column ? orderDir : 'asc')
    setIsOpen(false)
    setSearch('')
  }

  const DirectionIcon = orderDir === 'asc' ? IconArrowUp : IconArrowDown

  const panel = (
    <div className="flex flex-col">
      {orderBy && (
        <div className="border-b border-border p-2">
          <SlidingTabs
            tabs={DIRECTION_TABS}
            value={orderDir}
            onChange={(dir) => onChange(orderBy, dir)}
          />
        </div>
      )}
      <div className="border-b border-border px-2 py-1">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sort by…"
          aria-label="Search columns to sort by"
          className="h-8 w-full bg-transparent px-1 text-xs text-text outline-none placeholder:text-text-subtle"
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-text-subtle">
            No columns match &ldquo;{search}&rdquo;
          </p>
        ) : (
          <SlidingHoverList as="div">
            {filtered.map((column, i) => (
              <SlidingHoverList.Item as="div" key={column.name} index={i}>
                <button
                  type="button"
                  onClick={() => pick(column.name)}
                  className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left"
                >
                  <ColumnTypeIcon column={column} size={16} />
                  <span className="min-w-0 flex-1 truncate text-xs text-text">{column.name}</span>
                  {column.name === orderBy && (
                    <IconCheck size={14} className="shrink-0 text-accent-text" />
                  )}
                </button>
              </SlidingHoverList.Item>
            ))}
          </SlidingHoverList>
        )}
      </div>
    </div>
  )

  const popoverProps = {
    openPopover: isOpen,
    setOpenPopover: (open: boolean) => {
      setIsOpen(open)
      if (!open) setSearch('')
    },
    align: 'start' as const,
    side: 'bottom' as const,
    sideOffset: 6,
    popoverContentClassName: 'w-[min(18rem,calc(100vw-2rem))] p-0',
    content: panel
  }

  if (!orderBy) {
    return (
      <Popover {...popoverProps}>
        <button
          type="button"
          title="Sort rows by a column"
          className={cn(
            'flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text',
            isOpen && 'bg-surface-elevated text-text'
          )}
        >
          <IconArrowsSort size={14} />
          Sort
        </button>
      </Popover>
    )
  }

  return (
    <span className="inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-lg bg-control text-xs shadow-control">
      <Popover {...popoverProps}>
        <button
          type="button"
          title="Change the sort"
          className={cn(
            'flex cursor-pointer items-center gap-1.5 pr-1.5 pl-2 font-medium text-text transition-colors hover:bg-control-hover',
            isOpen && 'bg-surface-elevated'
          )}
        >
          <DirectionIcon size={14} className="shrink-0 text-text-subtle" />
          <span className="max-w-40 truncate">{orderBy}</span>
          <span className="font-normal text-text-muted">
            {orderDir === 'asc' ? 'ascending' : 'descending'}
          </span>
        </button>
      </Popover>
      <button
        type="button"
        aria-label="Remove sort"
        onClick={() => onChange(null, 'asc')}
        className="flex cursor-pointer items-center border-l border-border px-1.5 text-text-subtle transition-colors hover:bg-control-hover hover:text-text"
      >
        <IconX size={14} />
      </button>
    </span>
  )
}

import * as React from 'react'
import {
  IconColumns3,
  IconEye,
  IconEyeOff,
  IconPin,
  IconPinFilled,
  IconSearch
} from '@tabler/icons-react'
import { Popover } from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'
import { SlidingHoverList } from '@renderer/components/ui/sliding-hover-list'
import { cn } from '@renderer/lib/utils'
import type { ColumnInfo } from '@renderer/types'
import { ColumnTypeIcon } from './column-type-icon'

interface ColumnVisibilityMenuProps {
  columns: ColumnInfo[]
  hiddenColumns: string[]
  frozenColumns: string[]
  onToggle: (column: string) => void
  onToggleFrozen: (column: string) => void
  onShowAll: () => void
  /** False once the freeze cap is reached, so the pin can say why it is inert. */
  canFreezeMore: boolean
}

/**
 * Show, hide and pin columns.
 *
 * A Popover of plain buttons rather than a dropdown menu: a menu item owns its
 * whole row's activation, so the pin nested inside one toggled the column's
 * visibility as well as pinning it. Two sibling buttons cannot fight over a
 * click. It also matches the filter picker, which is the other list of columns
 * in this bar.
 */
export function ColumnVisibilityMenu({
  columns,
  hiddenColumns,
  frozenColumns,
  onToggle,
  onToggleFrozen,
  onShowAll,
  canFreezeMore
}: ColumnVisibilityMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const hiddenCount = hiddenColumns.length
  const visibleCount = columns.length - hiddenCount

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return columns
    return columns.filter((column) => column.name.toLowerCase().includes(query))
  }, [columns, search])

  return (
    <Popover
      openPopover={isOpen}
      setOpenPopover={(open) => {
        setIsOpen(open)
        if (!open) setSearch('')
      }}
      align="end"
      side="bottom"
      sideOffset={6}
      popoverContentClassName="w-[min(20rem,calc(100vw-2rem))] p-0"
      content={
        <div className="flex flex-col">
          <div className="border-b border-border px-2 py-1">
            <div className="relative">
              <IconSearch
                size={14}
                className="absolute top-1/2 left-2 -translate-y-1/2 text-text-subtle"
              />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search columns…"
                aria-label="Search columns"
                className="h-8 w-full rounded-md bg-transparent pr-2 pl-8 text-xs text-text outline-none placeholder:text-text-subtle"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-text-subtle">
                No columns match &ldquo;{search}&rdquo;
              </p>
            ) : (
              <SlidingHoverList as="div">
                {filtered.map((column, i) => {
                  const isHidden = hiddenColumns.includes(column.name)
                  const isFrozen = frozenColumns.includes(column.name)
                  // The last visible column cannot be hidden - an empty grid has
                  // no control left to bring anything back.
                  const isLastVisible = !isHidden && visibleCount <= 1
                  return (
                    <SlidingHoverList.Item as="div" key={column.name} index={i}>
                      <div className="flex items-center gap-1 rounded-md pr-1">
                        <button
                          type="button"
                          disabled={isLastVisible}
                          onClick={() => onToggle(column.name)}
                          title={isHidden ? 'Show this column' : 'Hide this column'}
                          className={cn(
                            'flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-left',
                            isLastVisible && 'cursor-default'
                          )}
                        >
                          <ColumnTypeIcon column={column} size={16} />
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-xs',
                              isHidden ? 'text-text-subtle line-through' : 'text-text'
                            )}
                          >
                            {column.name}
                          </span>
                          {isHidden ? (
                            <IconEyeOff size={16} className="shrink-0 text-text-subtle" />
                          ) : (
                            <IconEye size={16} className="shrink-0 text-text-subtle" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleFrozen(column.name)}
                          disabled={isHidden || (!isFrozen && !canFreezeMore)}
                          title={
                            isFrozen
                              ? 'Unpin from the left'
                              : canFreezeMore
                                ? 'Pin to the left'
                                : 'The pin limit is reached'
                          }
                          aria-label={
                            isFrozen ? `Unpin ${column.name}` : `Pin ${column.name} to the left`
                          }
                          className={cn(
                            'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-surface-active',
                            'disabled:cursor-default disabled:opacity-20 disabled:hover:bg-transparent',
                            isFrozen ? 'text-accent-text' : 'text-text-subtle hover:text-text'
                          )}
                        >
                          {isFrozen ? <IconPinFilled size={14} /> : <IconPin size={14} />}
                        </button>
                      </div>
                    </SlidingHoverList.Item>
                  )
                })}
              </SlidingHoverList>
            )}
          </div>

          <div className="flex h-10 items-center justify-between gap-2 border-t border-border px-3">
            <span className="text-[12px] text-text-subtle tabular-nums">
              {visibleCount} of {columns.length} shown
              {frozenColumns.length > 0 && ` · ${frozenColumns.length} pinned`}
            </span>
            <button
              type="button"
              onClick={onShowAll}
              disabled={hiddenCount === 0}
              className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted"
            >
              Show all
            </button>
          </div>
        </div>
      }
    >
      <Button size="sm" variant="outline" title="Show or hide columns">
        <IconColumns3 size={14} className="text-text-subtle" />
        Columns
        {hiddenCount > 0 && (
          <span className="text-[12px] font-normal text-text-subtle tabular-nums">
            {visibleCount}/{columns.length}
          </span>
        )}
      </Button>
    </Popover>
  )
}

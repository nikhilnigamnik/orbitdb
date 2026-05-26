import * as React from 'react'
import { IconFilter, IconPlus, IconX } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Popover } from '@renderer/components/ui/popover'
import { Select } from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import type { ColumnInfo, RowFilter } from '@renderer/types'

interface FiltersBarProps {
  columns: ColumnInfo[]
  filters: RowFilter[]
  onChange: (filters: RowFilter[]) => void
  onApply: () => void
}

const OPERATORS: { value: RowFilter['operator']; label: string }[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'like', label: 'like' },
  { value: 'ilike', label: 'ilike' },
  { value: 'is null', label: 'is null' },
  { value: 'is not null', label: 'not null' }
]

export function FiltersBar({ columns, filters, onChange, onApply }: FiltersBarProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const firstColumn = columns[0]?.name ?? ''
  const hasFilters = filters.length > 0

  const columnOptions = React.useMemo(
    () => columns.map((col) => ({ value: col.name, label: col.name })),
    [columns]
  )

  function addFilter() {
    if (!firstColumn) return
    onChange([...filters, { column: firstColumn, operator: '=', value: '' }])
    setIsOpen(true)
  }

  function updateFilter(index: number, patch: Partial<RowFilter>) {
    const next = filters.slice()
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  function removeFilter(index: number) {
    onChange(filters.filter((_, i) => i !== index))
  }

  function clearAll() {
    onChange([])
    onApply()
  }

  function handleApply(e?: React.FormEvent) {
    e?.preventDefault()
    onApply()
    setIsOpen(false)
  }

  return (
    <div className="flex items-center gap-1.5">
        <Popover
          openPopover={isOpen}
          setOpenPopover={setIsOpen}
          align="start"
          side="bottom"
          sideOffset={6}
          popoverContentClassName="w-[min(30rem,calc(100vw-2rem))]"
          content={
            <form onSubmit={handleApply} className="flex flex-col">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <IconFilter size={12} className="text-text-subtle" />
                  <span className="text-[11.5px] font-medium text-text">Filters</span>
                  {hasFilters && (
                    <span className="rounded bg-accent/15 px-1 py-0 text-[10px] font-semibold leading-tight text-accent">
                      {filters.length}
                    </span>
                  )}
                </div>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="cursor-pointer rounded px-1.5 py-0.5 text-[10.5px] text-text-subtle transition-colors hover:text-text"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto px-3 py-2.5">
                {filters.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-surface-elevated/20 px-4 py-6 text-center">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated/60 text-text-subtle">
                      <IconFilter size={13} />
                    </div>
                    <p className="text-[11.5px] text-text-muted">No filters yet</p>
                    <p className="text-[10.5px] text-text-subtle">
                      Add a condition to narrow down rows.
                    </p>
                  </div>
                ) : (
                  filters.map((filter, index) => {
                    const isUnary =
                      filter.operator === 'is null' || filter.operator === 'is not null'
                    return (
                      <div
                        key={index}
                        className="group/filter flex items-center gap-1 rounded-md border border-border bg-surface-elevated/30 p-1 transition-colors hover:border-border-strong"
                      >
                        <Select
                          value={filter.column}
                          onChange={(value) => updateFilter(index, { column: value })}
                          options={columnOptions}
                          size="sm"
                          className="min-w-[7rem] flex-1 border-transparent bg-transparent hover:bg-surface-elevated/60"
                          ariaLabel="Filter column"
                        />
                        <Select<RowFilter['operator']>
                          value={filter.operator}
                          onChange={(value) => updateFilter(index, { operator: value })}
                          options={OPERATORS}
                          size="sm"
                          className="min-w-[3.5rem] border-transparent bg-transparent font-mono hover:bg-surface-elevated/60"
                          contentClassName="min-w-[8rem]"
                          ariaLabel="Filter operator"
                        />
                        {isUnary ? (
                          <div className="flex-1" />
                        ) : (
                          <Input
                            value={filter.value ?? ''}
                            onChange={(e) => updateFilter(index, { value: e.target.value })}
                            placeholder="value"
                            className="h-7 flex-1 border-transparent bg-transparent text-[11.5px] hover:bg-surface-elevated/60 focus-visible:border-accent/40 focus-visible:bg-surface-elevated"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeFilter(index)}
                          aria-label="Remove filter"
                          className={cn(
                            'flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded transition-colors',
                            'text-text-subtle opacity-0 group-hover/filter:opacity-100',
                            'hover:bg-red-500/10 hover:text-red-400'
                          )}
                        >
                          <IconX size={12} />
                        </button>
                      </div>
                    )
                  })
                )}

                <button
                  type="button"
                  onClick={addFilter}
                  className="flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <IconPlus size={12} />
                  Add filter
                </button>
              </div>

              <div className="flex items-center justify-end gap-1.5 border-t border-border bg-surface-elevated/20 px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-text-muted hover:bg-surface-elevated hover:text-text"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-accent text-white hover:bg-accent/90">
                  Apply
                </Button>
              </div>
            </form>
          }
        >
          <button
            type="button"
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors',
              hasFilters || isOpen
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-border bg-surface-elevated/40 text-text-muted hover:bg-surface-elevated hover:text-text'
            )}
          >
            <IconFilter size={12} />
            Filters
            {hasFilters && (
              <span className="rounded bg-accent/20 px-1 py-0 text-[10px] font-semibold leading-tight">
                {filters.length}
              </span>
            )}
          </button>
        </Popover>
      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="cursor-pointer rounded-md px-2 py-1 text-[11.5px] text-text-subtle transition-colors hover:text-text"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

import * as React from 'react'
import { IconFilter, IconPlus, IconX } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { ColumnInfo, RowFilter } from '@renderer/types'

interface FiltersBarProps {
  columns: ColumnInfo[]
  filters: RowFilter[]
  onChange: (filters: RowFilter[]) => void
  onApply: () => void
}

const OPERATORS: RowFilter['operator'][] = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'like',
  'ilike',
  'is null',
  'is not null'
]

export function FiltersBar({ columns, filters, onChange, onApply }: FiltersBarProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const firstColumn = columns[0]?.name ?? ''

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

  function handleApply(e?: React.FormEvent) {
    e?.preventDefault()
    onApply()
  }

  return (
    <div className="border-b border-neutral-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
          onClick={() => setIsOpen((v) => !v)}
        >
          <IconFilter size={14} />
          Filters {filters.length > 0 && `(${filters.length})`}
        </Button>
        {filters.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            onClick={() => {
              onChange([])
              onApply()
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {isOpen && (
        <form onSubmit={handleApply} className="mt-2 space-y-2">
          {filters.length === 0 ? (
            <p className="text-xs text-neutral-500">No filters. Add one to narrow rows.</p>
          ) : (
            filters.map((filter, index) => {
              const isUnary = filter.operator === 'is null' || filter.operator === 'is not null'
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-2"
                >
                  <Select
                    value={filter.column}
                    onValueChange={(value) => updateFilter(index, { column: value })}
                  >
                    <SelectTrigger size="sm" className="min-w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col.name} value={col.name}>
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filter.operator}
                    onValueChange={(value) =>
                      updateFilter(index, { operator: value as RowFilter['operator'] })
                    }
                  >
                    <SelectTrigger size="sm" className="min-w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isUnary && (
                    <Input
                      value={filter.value ?? ''}
                      onChange={(e) => updateFilter(index, { value: e.target.value })}
                      placeholder="value"
                      className="h-7 flex-1 text-xs"
                    />
                  )}
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="text-neutral-400 hover:bg-neutral-800 hover:text-red-400"
                    onClick={() => removeFilter(index)}
                  >
                    <IconX size={12} />
                  </Button>
                </div>
              )
            })
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              onClick={addFilter}
            >
              <IconPlus size={12} />
              Add filter
            </Button>
            <div className="flex-1" />
            <Button type="submit" size="sm" className="bg-accent text-white hover:bg-accent/90">
              Apply
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

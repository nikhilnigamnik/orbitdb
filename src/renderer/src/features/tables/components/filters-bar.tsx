import * as React from 'react'
import {
  IconArrowLeft,
  IconCheck,
  IconDatabase,
  IconFilter2,
  IconLoader,
  IconPlus,
  IconSearch,
  IconX
} from '@tabler/icons-react'
import { AnimatedSize } from '@renderer/components/ui/animated-size'
import { Popover } from '@renderer/components/ui/popover'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import { formatCellValue } from '@renderer/lib/format'
import type { ColumnInfo, RowFilter } from '@renderer/types'

interface FiltersBarProps {
  connectionId: string
  schema: string
  table: string
  columns: ColumnInfo[]
  filters: RowFilter[]
  onChange: (filters: RowFilter[]) => void
  onApply: () => void
}

const OPERATORS: { value: RowFilter['operator']; label: string; unary?: boolean }[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'like', label: 'like' },
  { value: 'ilike', label: 'ilike' },
  { value: 'is null', label: 'is null', unary: true },
  { value: 'is not null', label: 'not null', unary: true }
]

export function FiltersBar({
  connectionId,
  schema,
  table,
  columns,
  filters,
  onChange,
  onApply
}: FiltersBarProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [columnSearch, setColumnSearch] = React.useState('')
  const [editingColumn, setEditingColumn] = React.useState<ColumnInfo | null>(null)
  const [operator, setOperator] = React.useState<RowFilter['operator']>('=')
  const [valueSearch, setValueSearch] = React.useState('')
  const [values, setValues] = React.useState<unknown[]>([])
  const [valuesLoading, setValuesLoading] = React.useState(false)
  const [valuesError, setValuesError] = React.useState<string | null>(null)

  const hasFilters = filters.length > 0

  const filteredColumns = React.useMemo(() => {
    const q = columnSearch.trim().toLowerCase()
    if (!q) return columns
    return columns.filter((c) => c.name.toLowerCase().includes(q))
  }, [columns, columnSearch])

  React.useEffect(() => {
    if (!editingColumn) return
    let cancelled = false
    setValuesLoading(true)
    setValuesError(null)
    const timer = window.setTimeout(() => {
      void unwrap(
        window.api.db.columnDistinct({
          connectionId,
          schema,
          table,
          column: editingColumn.name,
          search: valueSearch.trim() || undefined,
          limit: 100
        })
      )
        .then((rows) => {
          if (cancelled) return
          setValues(rows)
        })
        .catch((err) => {
          if (cancelled) return
          setValuesError(err instanceof Error ? err.message : String(err))
          setValues([])
        })
        .finally(() => {
          if (!cancelled) setValuesLoading(false)
        })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [editingColumn, valueSearch, connectionId, schema, table])

  function resetEditor() {
    setEditingColumn(null)
    setOperator('=')
    setValueSearch('')
    setValues([])
    setValuesError(null)
  }

  function openColumn(col: ColumnInfo) {
    setEditingColumn(col)
    setOperator('=')
    setValueSearch('')
  }

  function commitFilter(rawValue: unknown) {
    if (!editingColumn) return
    const opMeta = OPERATORS.find((o) => o.value === operator)
    const value = opMeta?.unary ? '' : rawValue == null ? '' : String(rawValue)
    onChange([...filters, { column: editingColumn.name, operator, value }])
    resetEditor()
    setColumnSearch('')
    onApply()
    setIsOpen(false)
  }

  function removeFilter(index: number) {
    const next = filters.filter((_, i) => i !== index)
    onChange(next)
    onApply()
  }

  function clearAll() {
    onChange([])
    onApply()
  }

  const operatorMeta = OPERATORS.find((o) => o.value === operator)
  const isUnary = !!operatorMeta?.unary
  const canCommitFreeText = isUnary || valueSearch.trim().length > 0

  return (
    <div className="flex w-full items-center gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {filters.map((f, i) => {
          const unary = f.operator === 'is null' || f.operator === 'is not null'
          return (
            <div
              key={i}
              className="inline-flex items-stretch overflow-hidden rounded-md border border-border bg-surface-elevated/60 text-[11.5px] text-text"
            >
              <div className="flex items-center gap-1.5 px-2 py-1">
                <IconDatabase size={11} className="text-text-subtle" />
                <span>{f.column}</span>
              </div>
              <div className="flex items-center border-l border-border px-2 py-1 font-mono text-text-muted">
                {f.operator}
              </div>
              {!unary && (
                <div className="flex max-w-40 items-center truncate border-l border-border px-2 py-1 font-mono">
                  {String(f.value ?? '')}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFilter(i)}
                aria-label="Remove filter"
                className="flex cursor-pointer items-center border-l border-border px-2 py-1 text-red-400 transition-colors hover:bg-red-500/10"
              >
                <IconX size={11} />
              </button>
            </div>
          )
        })}

      <Popover
        openPopover={isOpen}
        setOpenPopover={(open) => {
          setIsOpen(open)
          if (!open) resetEditor()
        }}
        align="start"
        side="bottom"
        sideOffset={6}
        popoverContentClassName="w-[min(28rem,calc(100vw-2rem))]"
        content={
          <AnimatedSize>{editingColumn ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-border px-2 py-1">
                <button
                  type="button"
                  onClick={resetEditor}
                  aria-label="Back to columns"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-subtle hover:bg-surface-elevated hover:text-text"
                >
                  <IconArrowLeft size={14} />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <IconDatabase size={12} className="text-text-subtle" />
                  <span className="truncate text-[13px] font-medium text-text">
                    {editingColumn.name}
                  </span>
                  <span className="font-mono text-[10.5px] text-text-subtle">
                    {editingColumn.udtName || editingColumn.dataType}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 border-b border-border px-2 py-2">
                {OPERATORS.map((op) => (
                  <button
                    key={op.value}
                    type="button"
                    onClick={() => setOperator(op.value)}
                    className={cn(
                      'cursor-pointer rounded-md border px-2 py-0.5 font-mono text-[11.5px]',
                      op.value === operator
                        ? 'border-border-strong bg-surface-elevated text-text'
                        : 'border-border bg-surface-elevated/30 text-text-muted hover:bg-surface-elevated hover:text-text'
                    )}
                  >
                    {op.label}
                  </button>
                ))}
              </div>

              {!isUnary && (
                <div className="border-b border-border px-2 py-1.5">
                  <div className="relative">
                    <IconSearch
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
                    />
                    <input
                      autoFocus
                      value={valueSearch}
                      onChange={(e) => setValueSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canCommitFreeText) {
                          e.preventDefault()
                          commitFilter(valueSearch)
                        }
                      }}
                      placeholder="Type a value or pick below…"
                      className="w-full rounded-md bg-transparent pl-8 pr-2 text-[13px] text-text outline-none placeholder:text-text-subtle"
                    />
                  </div>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto p-1">
                {isUnary ? (
                  <button
                    type="button"
                    onClick={() => commitFilter('')}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-2 py-2 text-[12.5px] font-medium text-text transition-colors hover:bg-surface-elevated"
                  >
                    <IconCheck size={13} />
                    Apply &ldquo;{operatorMeta?.label}&rdquo;
                  </button>
                ) : valuesLoading ? (
                  <div className="flex items-center justify-center py-6 text-text-subtle">
                    <IconLoader stroke={2} size={16} className="animate-spin" />
                  </div>
                ) : valuesError ? (
                  <p className="px-2 py-3 text-center text-[11.5px] text-red-300/80">
                    {valuesError}
                  </p>
                ) : values.length === 0 ? (
                  <div className="px-2 py-3 text-center">
                    <p className="text-[11.5px] text-text-subtle">
                      {valueSearch ? 'No matches' : 'No values'}
                    </p>
                    {valueSearch && (
                      <button
                        type="button"
                        onClick={() => commitFilter(valueSearch)}
                        className="mt-1.5 cursor-pointer rounded-md border border-border bg-surface-elevated/60 px-2 py-1 text-[11.5px] text-text hover:bg-surface-elevated"
                      >
                        Use &ldquo;{valueSearch}&rdquo;
                      </button>
                    )}
                  </div>
                ) : (
                  values.map((value, i) => {
                    const display = value === null ? 'NULL' : formatCellValue(value)
                    return (
                      <button
                        key={`${display}-${i}`}
                        type="button"
                        onClick={() => commitFilter(value)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated"
                      >
                        <span
                          className={cn(
                            'flex-1 truncate font-mono text-[12.5px]',
                            value === null ? 'italic text-text-subtle' : 'text-text'
                          )}
                        >
                          {display}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="border-b border-border px-2 py-1">
                <div className="relative">
                  <IconSearch
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
                  />
                  <input
                    autoFocus
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    placeholder="Select column to filter…"
                    className="h-8 w-full rounded-md bg-transparent pl-8 pr-2 text-[13px] text-text outline-none placeholder:text-text-subtle"
                  />
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto p-1">
                {filteredColumns.length === 0 ? (
                  <p className="px-2 py-3 text-center text-[11.5px] text-text-subtle">
                    No columns match &ldquo;{columnSearch}&rdquo;
                  </p>
                ) : (
                  filteredColumns.map((col) => (
                    <button
                      key={col.name}
                      type="button"
                      onClick={() => openColumn(col)}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated"
                    >
                      <IconDatabase size={14} className="shrink-0 text-text-subtle" />
                      <span className="flex-1 truncate text-[13px] text-text">{col.name}</span>
                      <span className="font-mono text-[11px] text-text-subtle">
                        {col.udtName || col.dataType}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}</AnimatedSize>
        }
      >
        <button
          type="button"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-surface-elevated/40 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          aria-label={hasFilters ? 'Add filter' : 'Open filters'}
        >
          {hasFilters ? <IconPlus stroke={2} size={14} /> : <IconFilter2 stroke={2} size={14} />}
        </button>
      </Popover>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11.5px] text-red-400 transition-colors hover:bg-red-500/15"
        >
          <IconFilter2 size={12} />
          Clear
        </button>
      )}
    </div>
  )
}

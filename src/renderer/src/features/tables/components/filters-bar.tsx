import * as React from 'react'
import {
  IconArrowLeft,
  IconDatabase,
  IconFilter2,
  IconPlus,
  IconSearch,
  IconX
} from '@tabler/icons-react'
import { Popover } from '@renderer/components/ui/popover'
import { Spinner } from '@renderer/components/ui/spinner'
import { SlidingHoverList } from '@renderer/components/ui/sliding-hover-list'
import { useDebounce } from '@renderer/hooks/use-debounce'
import {
  OPERATORS,
  isUnaryOperator,
  resolveFilter,
  upsertFilter,
  usesWildcards
} from '@renderer/features/tables/lib/filter-editor'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import { formatCellValue } from '@renderer/lib/format'
import type { ColumnInfo, RowFilter } from '@renderer/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

interface FiltersBarProps {
  connectionId: string
  schema: string
  table: string
  columns: ColumnInfo[]
  filters: RowFilter[]
  onChange: (filters: RowFilter[]) => void
  onApply: () => void
}

/** Enough distinct values to be worth scrolling; the box below narrows them. */
const SUGGESTION_LIMIT = 12

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
  /** Index of the filter being rewritten, or null when building a new one. */
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null)
  const [operator, setOperator] = React.useState<RowFilter['operator']>('=')
  const [valueSearch, setValueSearch] = React.useState('')
  const [values, setValues] = React.useState<unknown[]>([])
  const [valuesLoading, setValuesLoading] = React.useState(false)
  const [valuesError, setValuesError] = React.useState<string | null>(null)

  const panelRef = React.useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = React.useState<number | undefined>(undefined)

  const hasFilters = filters.length > 0
  // The value box doubles as a search over the column's distinct values, so hold
  // it back rather than querying the database on every keystroke.
  const valueQuery = useDebounce(valueSearch.trim(), 200)

  const filteredColumns = React.useMemo(() => {
    const q = columnSearch.trim().toLowerCase()
    if (!q) return columns
    return columns.filter((c) => c.name.toLowerCase().includes(q))
  }, [columns, columnSearch])

  React.useLayoutEffect(() => {
    const target = panelRef.current
    if (target) setPanelHeight(target.scrollHeight)
  }, [editingColumn, filteredColumns, values, valuesLoading, valuesError, operator, valueSearch])

  React.useEffect(() => {
    if (!editingColumn) return
    let cancelled = false
    setValuesLoading(true)
    setValuesError(null)
    void unwrap(
      window.api.db.columnDistinct({
        connectionId,
        schema,
        table,
        column: editingColumn.name,
        search: valueQuery || undefined,
        limit: SUGGESTION_LIMIT
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
    return () => {
      cancelled = true
    }
  }, [editingColumn, connectionId, schema, table, valueQuery])

  function resetEditor() {
    setEditingColumn(null)
    setEditingIndex(null)
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

  /** Reopen the editor on an applied filter so it can be rewritten in place. */
  function editFilter(index: number) {
    const target = filters[index]
    const column = columns.find((c) => c.name === target.column)
    if (!column) return
    setEditingIndex(index)
    setEditingColumn(column)
    setOperator(target.operator)
    setValueSearch(target.value ?? '')
    setColumnSearch('')
    setIsOpen(true)
  }

  function commitFilter(rawValue: unknown) {
    if (!editingColumn) return
    const next = resolveFilter(editingColumn.name, operator, rawValue)
    onChange(upsertFilter(filters, next, editingIndex))
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

  function clearFilters() {
    onChange([])
    onApply()
  }

  const operatorMeta = OPERATORS.find((o) => o.value === operator)
  const isUnary = isUnaryOperator(operator)
  const isPattern = usesWildcards(operator)
  const canCommitFreeText = isUnary || valueSearch.trim().length > 0

  return (
    <div className="flex w-full items-center gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {filters.map((f, i) => {
          const unary = f.operator === 'is null' || f.operator === 'is not null'
          // h-7 stands the chip level with the trigger beside it and the fields
          // above it; the segments stretch to fill rather than set their own height.
          return (
            <div
              key={i}
              className="inline-flex h-7 items-stretch overflow-hidden rounded-md border border-border bg-surface-elevated/60 text-xs text-text"
            >
              <button
                type="button"
                onClick={() => editFilter(i)}
                aria-label={`Edit filter on ${f.column}`}
                className="group/edit flex cursor-pointer items-stretch transition-colors hover:bg-surface-elevated"
              >
                <span className="flex items-center gap-1.5 px-2">
                  <IconDatabase size={11} className="text-text-subtle" />
                  {f.column}
                </span>
                <span className="flex items-center border-l border-border px-2 font-mono text-text-muted group-hover/edit:text-text">
                  {f.operator}
                </span>
                {!unary && (
                  <span className="flex max-w-40 items-center truncate border-l border-border px-2 font-mono">
                    {String(f.value ?? '')}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => removeFilter(i)}
                aria-label="Remove filter"
                className="flex cursor-pointer items-center border-l border-border px-2 text-danger transition-colors hover:bg-danger/10"
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
            <div
              style={{
                height: panelHeight ?? 'auto',
                transition: 'height 200ms ease-out'
              }}
              className="overflow-hidden"
            >
              <div ref={panelRef}>
                {editingColumn ? (
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
                        <span className="truncate text-xs font-medium text-text">
                          {editingColumn.name}
                        </span>
                        <span className="font-mono text-xs text-text-subtle">
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
                            'cursor-pointer rounded-md border px-2 py-0.5 font-mono text-xs',
                            op.value === operator
                              ? 'border-border-strong bg-surface-elevated text-text'
                              : 'border-border bg-surface-elevated/30 text-text-muted hover:bg-surface-elevated hover:text-text'
                          )}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>

                    {isUnary ? (
                      <div className="p-2">
                        <button
                          type="button"
                          onClick={() => commitFilter('')}
                          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-2 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90"
                        >
                          {editingIndex == null ? 'Apply' : 'Update'} &ldquo;{operatorMeta?.label}
                          &rdquo;
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 p-2">
                        <div className="flex items-center gap-1.5">
                          <Input
                            autoFocus
                            value={valueSearch}
                            onChange={(e) => setValueSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && canCommitFreeText) {
                                e.preventDefault()
                                commitFilter(valueSearch)
                              }
                            }}
                            placeholder={isPattern ? 'e.g. %term%' : 'Enter value…'}
                          />
                          <Button
                            onClick={() => commitFilter(valueSearch)}
                            disabled={!canCommitFreeText}
                          >
                            {editingIndex == null ? 'Apply' : 'Update'}
                          </Button>
                        </div>

                        {isPattern && (
                          <p className="text-xs text-text-subtle">
                            <span className="font-mono text-text-muted">%</span> matches any run of
                            characters — a bare term matches only an exact value.
                          </p>
                        )}

                        {valuesLoading ? (
                          <div className="flex items-center justify-center py-1 text-text-subtle">
                            <Spinner size={14} />
                          </div>
                        ) : valuesError ? (
                          <p className="text-xs text-danger">{valuesError}</p>
                        ) : values.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium uppercase tracking-wider text-text-subtle">
                              Suggestions
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {values.map((value, i) => {
                                const display = value === null ? 'NULL' : formatCellValue(value)
                                return (
                                  <button
                                    key={`${display}-${i}`}
                                    type="button"
                                    onClick={() => commitFilter(value)}
                                    className={cn(
                                      'max-w-full cursor-pointer truncate rounded-md border border-border bg-surface-elevated/40 px-2 py-0.5 font-mono text-xs transition-colors hover:border-border-strong hover:bg-surface-elevated',
                                      value === null
                                        ? 'italic text-text-subtle'
                                        : 'text-text-muted hover:text-text'
                                    )}
                                  >
                                    {display}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
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
                          className="h-8 w-full rounded-md bg-transparent pl-8 pr-2 text-xs text-text outline-none placeholder:text-text-subtle"
                        />
                      </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto p-1">
                      {filteredColumns.length === 0 ? (
                        <p className="px-2 py-3 text-center text-xs text-text-subtle">
                          No columns match &ldquo;{columnSearch}&rdquo;
                        </p>
                      ) : (
                        <SlidingHoverList as="div">
                          {filteredColumns.map((col, i) => (
                            <SlidingHoverList.Item as="div" key={col.name} index={i}>
                              <button
                                type="button"
                                onClick={() => openColumn(col)}
                                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left"
                              >
                                <IconDatabase size={14} className="shrink-0 text-text-subtle" />
                                <span className="flex-1 truncate text-xs text-text">
                                  {col.name}
                                </span>
                                <span className="font-mono text-xs text-text-subtle">
                                  {col.udtName || col.dataType}
                                </span>
                              </button>
                            </SlidingHoverList.Item>
                          ))}
                        </SlidingHoverList>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          }
        >
          <Button
            type="button"
            variant="subtle"
            size="icon-sm"
            aria-label={hasFilters ? 'Add filter' : 'Open filters'}
          >
            {hasFilters ? <IconPlus stroke={2} size={14} /> : <IconFilter2 stroke={2} size={14} />}
          </Button>
        </Popover>

        {filters.length > 1 && (
          <Button
            type="button"
            variant="subtle"
            size="sm"
            onClick={clearFilters}
            aria-label="Clear all filters"
          >
            <IconX size={12} />
            Clear all
          </Button>
        )}
      </div>
    </div>
  )
}

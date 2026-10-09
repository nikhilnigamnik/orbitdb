import * as React from 'react'
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
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
import type { ColumnInfo, FilterJoin, RowFilter } from '@renderer/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ColumnTypeIcon } from './column-type-icon'

interface FiltersBarProps {
  connectionId: string
  schema: string
  table: string
  columns: ColumnInfo[]
  filters: RowFilter[]
  onChange: (filters: RowFilter[]) => void
  /** How the filters combine. Only meaningful once there are two. */
  join?: FilterJoin
  onChangeJoin?: (join: FilterJoin) => void
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
  join = 'and',
  onChangeJoin,
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
          const connector =
            i === 0 || !onChangeJoin ? null : (
              <button
                key={`join-${i}`}
                type="button"
                onClick={() => onChangeJoin(join === 'and' ? 'or' : 'and')}
                title="Switch between matching all filters and any of them"
                className="h-7 cursor-pointer rounded-lg bg-surface px-2 text-xs font-medium text-text-muted capitalize shadow-control transition-colors hover:bg-surface-elevated hover:text-text"
              >
                {join}
              </button>
            )
          // h-7 stands the chip level with the trigger beside it and the fields
          // above it; the segments stretch to fill rather than set their own height.
          // White with the hairline halo, as Attio draws an applied filter.
          const column = columns.find((c) => c.name === f.column)
          const summary = unary
            ? `${f.column} ${f.operator}`
            : `${f.column} ${f.operator} ${String(f.value ?? '')}`
          return (
            <React.Fragment key={i}>
              {connector}
              <div className="inline-flex h-7 items-stretch overflow-hidden rounded-lg bg-surface text-xs text-text shadow-control">
                <button
                  type="button"
                  onClick={() => editFilter(i)}
                  aria-label={`Edit filter: ${summary}`}
                  className="group/edit flex cursor-pointer items-stretch transition-colors hover:bg-surface-elevated"
                >
                  <span className="flex items-center gap-1.5 pr-1.5 pl-2 font-medium">
                    {column ? (
                      <ColumnTypeIcon column={column} />
                    ) : (
                      <IconAdjustmentsHorizontal size={14} className="text-text-subtle" />
                    )}
                    {f.column}
                  </span>
                  <span className="flex items-center px-1.5 text-text-muted group-hover/edit:text-text">
                    {f.operator}
                  </span>
                  {!unary && (
                    <span className="flex max-w-40 items-center truncate pr-2 pl-1.5 font-mono text-accent-text">
                      {String(f.value ?? '')}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeFilter(i)}
                  aria-label={`Remove filter on ${f.column}`}
                  className="flex cursor-pointer items-center border-l border-border px-1.5 text-text-subtle transition-colors hover:bg-surface-elevated hover:text-danger"
                >
                  <IconX size={14} />
                </button>
              </div>
            </React.Fragment>
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
                    <div className="flex h-10 items-center gap-2 border-b border-border px-2">
                      <button
                        type="button"
                        onClick={resetEditor}
                        aria-label="Back to columns"
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-subtle hover:bg-surface-elevated hover:text-text"
                      >
                        <IconArrowLeft size={16} />
                      </button>
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <ColumnTypeIcon column={editingColumn} size={16} />
                        <span className="truncate text-sm font-medium text-text">
                          {editingColumn.name}
                        </span>
                        <span className="text-[12px] text-text-subtle">
                          {editingColumn.udtName || editingColumn.dataType}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
                      {OPERATORS.map((op) => (
                        <button
                          key={op.value}
                          type="button"
                          onClick={() => setOperator(op.value)}
                          className={cn(
                            'h-7 min-w-7 cursor-pointer rounded-lg px-2 text-xs font-medium transition-colors',
                            op.value === operator
                              ? 'bg-surface text-text shadow-control'
                              : 'text-text-muted hover:bg-surface-elevated hover:text-text'
                          )}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>

                    {isUnary ? (
                      <div className="p-2">
                        <Button type="button" className="w-full" onClick={() => commitFilter('')}>
                          {editingIndex == null ? 'Apply' : 'Update'} &ldquo;{operatorMeta?.label}
                          &rdquo;
                        </Button>
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
                          <p className="text-[12px] text-text-subtle">
                            <span className="font-mono text-text-muted">%</span> matches any run of
                            characters - a bare term matches only an exact value.
                          </p>
                        )}

                        {valuesLoading ? (
                          <div className="flex items-center justify-center py-1 text-text-subtle">
                            <Spinner size={14} />
                          </div>
                        ) : valuesError ? (
                          <p className="text-xs text-danger">{valuesError}</p>
                        ) : values.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[12px] font-medium text-text-subtle">
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
                                      'h-6 max-w-full cursor-pointer truncate rounded-md bg-surface px-2 font-mono text-xs shadow-control transition-colors hover:bg-surface-elevated',
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
                          size={14}
                          className="absolute top-1/2 left-2 -translate-y-1/2 text-text-subtle"
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
                                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left"
                              >
                                <ColumnTypeIcon column={col} size={16} />
                                <span className="flex-1 truncate text-xs text-text">
                                  {col.name}
                                </span>
                                <span className="text-[12px] text-text-subtle">
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
          {/* Attio's dashed chip: an outline that only promises a control until
              something is applied, at which point the applied filters carry the
              weight and this shrinks to a plus. */}
          <Button
            type="button"
            variant="subtle"
            size={hasFilters ? 'icon-sm' : 'sm'}
            aria-label={hasFilters ? 'Add filter' : 'Open filters'}
            className="rounded-lg border-dashed border-border-strong px-2 aria-expanded:border-border-strong"
          >
            {hasFilters ? (
              <IconPlus size={14} />
            ) : (
              <>
                <IconAdjustmentsHorizontal size={14} />
                Filter
              </>
            )}
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
            <IconX size={14} />
            Clear all
          </Button>
        )}
      </div>
    </div>
  )
}

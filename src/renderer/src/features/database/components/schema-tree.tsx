import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IconChevronRight,
  IconTable,
  IconEye,
  IconRefresh,
  IconSearch,
  IconDatabase,
  IconPinFilled
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { useCommandPalette } from '@renderer/features/command-palette/store'
import {
  loadPinned,
  togglePinned,
  type TableRef
} from '@renderer/features/database/lib/table-prefs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { SlidingHoverList } from '@renderer/components/ui/sliding-hover-list'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { ErrorState } from '@renderer/components/common/error-state'
import { Kbd } from '@renderer/components/ui/kbd'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import { formatNumber } from '@renderer/lib/format'
import { tableRoute } from '@renderer/config/routes'
import { onSchemaTablesChanged } from '@renderer/features/database/lib/schema-events'
import { TableActionsMenu } from './table-actions-menu'
import type { TableInfo } from '@renderer/types'

interface SchemaTreeProps {
  connectionId: string
  schemas: string[]
  onRefresh: () => void
  isLoading: boolean
}

interface TablesState {
  tables: TableInfo[]
  isLoading: boolean
  error: string | null
}

/**
 * Tables rendered per schema before the rest are held back. The sidebar has one
 * scroll container spanning every schema, so virtualising nested collapsibles
 * would be a large change; a cap keeps an unbounded list from becoming an
 * unbounded render, and the palette is the way to find a specific table anyway.
 */
const VISIBLE_TABLE_LIMIT = 200

export function SchemaTree({ connectionId, schemas, onRefresh, isLoading }: SchemaTreeProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeSchema = searchParams.get('schema') ?? ''
  const activeTable = searchParams.get('table') ?? ''

  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set())
  // 'public' only exists on Postgres - D1 calls its one schema 'main' and MySQL
  // uses database names, so hardcoding it left those engines collapsed on every
  // launch. Open the conventional one if it is there, otherwise the only one.
  const hasAutoExpanded = React.useRef(false)
  React.useEffect(() => {
    if (hasAutoExpanded.current || schemas.length === 0) return
    hasAutoExpanded.current = true
    const initial = schemas.includes('public') ? 'public' : schemas.length === 1 ? schemas[0] : null
    if (initial) setExpanded((prev) => new Set(prev).add(initial))
  }, [schemas])
  const [tablesBySchema, setTablesBySchema] = React.useState<Record<string, TablesState>>({})
  const [pinned, setPinned] = React.useState<TableRef[]>(() => loadPinned(connectionId))
  const [expandedLists, setExpandedLists] = React.useState<Set<string>>(() => new Set())
  const { open: openPalette } = useCommandPalette()

  React.useEffect(() => {
    setPinned(loadPinned(connectionId))
  }, [connectionId])

  function handleTogglePin(ref: TableRef) {
    setPinned(togglePinned(connectionId, ref))
  }

  const pinnedSet = React.useMemo(
    () => new Set(pinned.map((p) => `${p.schema}.${p.table}`)),
    [pinned]
  )

  const fetchTables = React.useCallback(
    async (schema: string) => {
      setTablesBySchema((prev) => ({
        ...prev,
        [schema]: { tables: [], isLoading: true, error: null }
      }))
      try {
        const tables = await unwrap(window.api.db.listTables(connectionId, schema))
        setTablesBySchema((prev) => ({
          ...prev,
          [schema]: { tables, isLoading: false, error: null }
        }))
      } catch (err) {
        setTablesBySchema((prev) => ({
          ...prev,
          [schema]: {
            tables: [],
            isLoading: false,
            error: err instanceof Error ? err.message : String(err)
          }
        }))
      }
    },
    [connectionId]
  )

  React.useEffect(() => {
    for (const schema of expanded) {
      if (!tablesBySchema[schema]) {
        void fetchTables(schema)
      }
    }
  }, [expanded, fetchTables, tablesBySchema])

  // Re-fetch a schema's tables when a truncate/drop happens anywhere (the tree
  // row menu or the table header overflow menu) for a schema we've loaded.
  const loadedSchemasRef = React.useRef<Set<string>>(new Set())
  React.useEffect(() => {
    loadedSchemasRef.current = new Set(Object.keys(tablesBySchema))
  }, [tablesBySchema])
  React.useEffect(() => {
    return onSchemaTablesChanged((connId, changedSchema) => {
      if (connId === connectionId && loadedSchemasRef.current.has(changedSchema)) {
        void fetchTables(changedSchema)
      }
    })
  }, [connectionId, fetchTables])

  React.useEffect(() => {
    if (!activeSchema) return
    setExpanded((prev) => {
      if (prev.has(activeSchema)) return prev
      const next = new Set(prev)
      next.add(activeSchema)
      return next
    })
  }, [activeSchema])

  function toggleSchema(schema: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(schema)) next.delete(schema)
      else next.add(schema)
      return next
    })
  }

  function selectTable(schema: string, table: TableInfo) {
    navigate(tableRoute(schema, table.name))
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-4 pb-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-elevated/40 text-text-muted ring-1 ring-inset ring-border">
              <IconDatabase size={13} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold text-text">Schemas</span>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="subtle"
                onClick={() => {
                  setTablesBySchema({})
                  onRefresh()
                }}
                aria-label="Refresh schemas"
              >
                {isLoading ? (
                  <Spinner size={12} className="text-current" />
                ) : (
                  <IconRefresh size={12} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh schemas</TooltipContent>
          </Tooltip>
        </div>
        <button
          type="button"
          onClick={openPalette}
          aria-label="Open command palette"
          className="group flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-input px-2.5 text-left text-xs text-text-subtle transition-colors hover:bg-surface-elevated/40 hover:text-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
        >
          <IconSearch size={12} className="shrink-0" />
          <span className="flex-1 truncate">Search tables…</span>
          <span className="flex shrink-0 items-center gap-0.5">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {pinned.length > 0 && (
          <div className="mb-2 border-b border-border/60 pb-2">
            <div className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-text-subtle">
              Pinned
            </div>
            <SlidingHoverList as="div">
              {pinned.map((pin, idx) => {
                const isActive = activeSchema === pin.schema && activeTable === pin.table
                return (
                  <SlidingHoverList.Item
                    as="div"
                    key={`${pin.schema}.${pin.table}`}
                    index={idx}
                    className={cn(
                      'group/row flex w-full items-center gap-1 rounded-md',
                      isActive ? 'bg-surface-elevated text-text' : 'text-text-muted hover:text-text'
                    )}
                  >
                    <button
                      onClick={() => navigate(tableRoute(pin.schema, pin.table))}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
                      title={`${pin.schema}.${pin.table}`}
                    >
                      <IconTable
                        size={12}
                        className={cn(
                          'shrink-0',
                          isActive ? 'text-text-muted' : 'text-text-subtle'
                        )}
                      />
                      <span className="truncate">{pin.table}</span>
                      <span className="ml-auto truncate font-mono text-xs text-text-subtle">
                        {pin.schema}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTogglePin(pin)
                      }}
                      className="mr-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-warning transition-colors hover:bg-surface hover:text-text"
                      aria-label="Unpin table"
                      title="Unpin table"
                    >
                      <IconPinFilled size={11} />
                    </button>
                  </SlidingHoverList.Item>
                )
              })}
            </SlidingHoverList>
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded-md" />
            ))}
          </div>
        ) : schemas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 px-4 text-center">
            <IconDatabase size={20} className="text-text-subtle" />
            <p className="text-xs font-medium text-text">No schemas</p>
            <p className="text-xs text-text-subtle">This database has no visible schemas.</p>
          </div>
        ) : (
          schemas.map((schema) => {
            const isOpen = expanded.has(schema)
            const state = tablesBySchema[schema]
            const allTables = state?.tables ?? []
            const showsAll = expandedLists.has(schema) || allTables.length <= VISIBLE_TABLE_LIMIT
            const visibleTables = showsAll ? allTables : allTables.slice(0, VISIBLE_TABLE_LIMIT)
            const isSchemaActive = activeSchema === schema
            return (
              <Collapsible
                key={schema}
                open={isOpen}
                onOpenChange={() => toggleSchema(schema)}
                className="mb-1"
              >
                <CollapsibleTrigger
                  className={cn(
                    'group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-surface-elevated/40',
                    isSchemaActive ? 'text-text' : 'text-text-muted hover:text-text'
                  )}
                >
                  <IconChevronRight
                    size={12}
                    className={cn(
                      'shrink-0 text-text-subtle transition-transform duration-200',
                      isOpen && 'rotate-90'
                    )}
                  />
                  <span className="truncate">{schema}</span>
                  {state && !state.isLoading && (
                    <span className="ml-auto text-xs text-text-subtle">{allTables.length}</span>
                  )}
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="ml-3 mt-0.5 pl-2">
                    {state?.isLoading ? (
                      <div className="flex items-center justify-center px-3 py-3 text-text-subtle">
                        <Spinner size={14} />
                      </div>
                    ) : state?.error ? (
                      <div className="px-1 py-1.5">
                        <ErrorState
                          message={state.error}
                          onRetry={() => void fetchTables(schema)}
                        />
                      </div>
                    ) : allTables.length === 0 ? (
                      <p className="px-3 py-1.5 text-xs text-text-subtle">Empty schema</p>
                    ) : (
                      <SlidingHoverList as="div">
                        {visibleTables.map((table, idx) => {
                          const isActive = isSchemaActive && activeTable === table.name
                          const isView = table.type === 'view' || table.type === 'materialized_view'
                          const Icon = isView ? IconEye : IconTable
                          const tableIsPinned = pinnedSet.has(`${schema}.${table.name}`)
                          return (
                            <SlidingHoverList.Item
                              as="div"
                              key={table.name}
                              index={idx}
                              className={cn(
                                'group/row flex w-full items-center gap-1 rounded-md',
                                isActive
                                  ? 'bg-surface-elevated text-text'
                                  : 'text-text-muted hover:text-text'
                              )}
                            >
                              <button
                                onClick={() => selectTable(schema, table)}
                                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
                                title={table.name}
                              >
                                <Icon
                                  size={12}
                                  className={cn(
                                    'shrink-0',
                                    isActive ? 'text-text-muted' : 'text-text-subtle'
                                  )}
                                />
                                <span className="truncate">{table.name}</span>
                                {isView ? (
                                  <span className="ml-auto rounded bg-surface-elevated px-1 py-0 text-xs font-medium uppercase tracking-wide text-text-subtle">
                                    view
                                  </span>
                                ) : (
                                  table.estimatedRows != null && (
                                    // Marked approximate to agree with the table
                                    // header: this is the engine's statistic, not
                                    // a count. Zero is a real answer and stays.
                                    <span
                                      className="ml-auto font-mono text-xs text-text-subtle opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                                      title={`About ${formatNumber(table.estimatedRows)} rows, from table statistics`}
                                    >
                                      ~{formatNumber(table.estimatedRows)}
                                    </span>
                                  )
                                )}
                              </button>
                              {tableIsPinned && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleTogglePin({ schema, table: table.name })
                                  }}
                                  className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-warning transition-colors hover:bg-surface hover:text-text"
                                  aria-label="Unpin table"
                                  title="Unpin table"
                                >
                                  <IconPinFilled size={11} />
                                </button>
                              )}
                              <TableActionsMenu
                                connectionId={connectionId}
                                schema={schema}
                                table={table}
                                isPinned={tableIsPinned}
                                onTogglePin={() => handleTogglePin({ schema, table: table.name })}
                              />
                            </SlidingHoverList.Item>
                          )
                        })}
                      </SlidingHoverList>
                    )}
                    {!showsAll && (
                      <button
                        type="button"
                        onClick={() => setExpandedLists((prev) => new Set(prev).add(schema))}
                        className="mt-0.5 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs text-text-subtle transition-colors hover:bg-surface-elevated/40 hover:text-text"
                      >
                        Show {formatNumber(allTables.length - VISIBLE_TABLE_LIMIT)} more…
                      </button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )
          })
        )}
      </div>
    </div>
  )
}

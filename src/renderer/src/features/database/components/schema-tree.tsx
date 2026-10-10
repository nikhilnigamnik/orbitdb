import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IconChevronRight,
  IconTable,
  IconEye,
  IconRefresh,
  IconPinFilled
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { useAsync } from '@renderer/hooks/use-async'
import {
  loadPinned,
  togglePinned,
  type TableRef
} from '@renderer/features/database/lib/table-prefs'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { SlidingHoverList } from '@renderer/components/ui/sliding-hover-list'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { ErrorState } from '@renderer/components/common/error-state'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import { formatNumber } from '@renderer/lib/format'
import { ROUTES, tableRoute } from '@renderer/config/routes'
import { onSchemaTablesChanged } from '@renderer/features/database/lib/schema-events'
import { tileColor } from '@renderer/features/database/lib/tile-color'
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

  React.useEffect(() => {
    setPinned(loadPinned(connectionId))
  }, [connectionId])

  const handleTogglePin = React.useCallback(
    (ref: TableRef) => setPinned(togglePinned(connectionId, ref)),
    [connectionId]
  )

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
      if (connId !== connectionId) return
      // A rename or drop moves or removes a pin in storage; re-read it so the
      // Favorites section does not keep a name that no longer exists.
      setPinned(loadPinned(connectionId))
      if (loadedSchemasRef.current.has(changedSchema)) void fetchTables(changedSchema)
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

  // useNavigate hands back a new function whenever the location changes, so a
  // row given it directly would re-render on every click. The ref keeps the
  // callback stable and lets the memoised rows skip all but the two that
  // actually changed state.
  const navigateRef = React.useRef(navigate)
  React.useLayoutEffect(() => {
    navigateRef.current = navigate
  }, [navigate])
  const selectTable = React.useCallback((schema: string, table: string) => {
    navigateRef.current(tableRoute(schema, table))
  }, [])
  const navigateTo = React.useCallback((to: string) => navigateRef.current(to), [])
  const searchParamsRef = React.useRef(searchParams)
  React.useLayoutEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])
  // Leaves the table view when the table on screen is the one just dropped.
  const handleDropped = React.useCallback((schema: string, table: string) => {
    const params = searchParamsRef.current
    if (params.get('schema') === schema && params.get('table') === table) {
      navigateRef.current(ROUTES.database, { replace: true })
    }
  }, [])

  const isSingleSchema = schemas.length === 1

  function renderTables(schema: string, indent: boolean) {
    const state = tablesBySchema[schema]
    const allTables = state?.tables ?? []
    const showsAll = expandedLists.has(schema) || allTables.length <= VISIBLE_TABLE_LIMIT
    const visibleTables = showsAll ? allTables : allTables.slice(0, VISIBLE_TABLE_LIMIT)
    const isSchemaActive = activeSchema === schema
    return (
      <div className={cn(indent && 'ml-3.5 border-l border-border pl-1.5')}>
        {state?.isLoading ? (
          <div className="flex flex-col gap-1 px-2 py-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full rounded-md" />
            ))}
          </div>
        ) : state?.error ? (
          <div className="px-1 py-1.5">
            <ErrorState message={state.error} onRetry={() => void fetchTables(schema)} />
          </div>
        ) : allTables.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-text-subtle">No tables</p>
        ) : (
          <SlidingHoverList as="div" highlightClassName="rounded-lg bg-surface-active/60">
            {visibleTables.map((table, idx) => (
              <TableRow
                key={table.name}
                index={idx}
                connectionId={connectionId}
                schema={schema}
                table={table}
                isActive={isSchemaActive && activeTable === table.name}
                isPinned={pinnedSet.has(`${schema}.${table.name}`)}
                onSelect={selectTable}
                onTogglePin={handleTogglePin}
                onNavigate={navigateTo}
                onDropped={handleDropped}
              />
            ))}
          </SlidingHoverList>
        )}
        {!showsAll && (
          <button
            type="button"
            onClick={() => setExpandedLists((prev) => new Set(prev).add(schema))}
            className="mt-px flex h-7 w-full cursor-pointer items-center rounded-lg px-2 text-left text-xs text-text-muted transition-colors hover:bg-surface-active/60 hover:text-text"
          >
            Show {formatNumber(allTables.length - VISIBLE_TABLE_LIMIT)} more…
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 pt-4">
      {pinned.length > 0 && (
        <SidebarSection title="Favorites">
          <SlidingHoverList as="div" highlightClassName="rounded-lg bg-surface-active/60">
            {pinned.map((pin, idx) => {
              const isActive = activeSchema === pin.schema && activeTable === pin.table
              return (
                <SlidingHoverList.Item
                  as="div"
                  key={`${pin.schema}.${pin.table}`}
                  index={idx}
                  className={cn(
                    'group/row flex h-7 w-full items-center gap-0.5 rounded-lg',
                    isActive && 'bg-surface-active'
                  )}
                >
                  <button
                    onClick={() => navigate(tableRoute(pin.schema, pin.table))}
                    className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg pl-2 text-left text-sm font-medium text-text"
                    title={`${pin.schema}.${pin.table}`}
                  >
                    <TableTile name={pin.table} isView={false} />
                    <span className="truncate">{pin.table}</span>
                    {!isSingleSchema && (
                      <span className="ml-auto truncate pr-1 text-[12px] font-normal text-text-subtle">
                        {pin.schema}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTogglePin(pin)
                    }}
                    className="mr-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-warning transition-colors hover:bg-surface"
                    aria-label="Unpin table"
                    title="Unpin table"
                  >
                    <IconPinFilled size={12} />
                  </button>
                </SlidingHoverList.Item>
              )
            })}
          </SlidingHoverList>
        </SidebarSection>
      )}

      <SidebarSection
        title="Tables"
        actions={
          <Button
            size="icon-xs"
            variant="subtle"
            onClick={() => {
              setTablesBySchema({})
              onRefresh()
            }}
            aria-label="Refresh schemas"
            title="Refresh schemas"
          >
            {isLoading ? <Spinner size={12} className="text-current" /> : <IconRefresh size={13} />}
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex flex-col gap-1 px-2 py-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full rounded-md" />
            ))}
          </div>
        ) : schemas.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-text-subtle">
            This database has no visible schemas.
          </p>
        ) : isSingleSchema ? (
          // One schema - D1's 'main', a MySQL database - is not worth a level of
          // nesting; its tables sit directly under the section, as Attio's
          // records do.
          renderTables(schemas[0], false)
        ) : (
          schemas.map((schema) => {
            const isOpen = expanded.has(schema)
            const state = tablesBySchema[schema]
            return (
              <Collapsible key={schema} open={isOpen} onOpenChange={() => toggleSchema(schema)}>
                <CollapsibleTrigger className="group flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface-active/60">
                  <IconChevronRight
                    size={14}
                    className={cn(
                      'shrink-0 text-text-subtle transition-transform duration-200',
                      isOpen && 'rotate-90'
                    )}
                  />
                  <span className="truncate">{schema}</span>
                  {state && !state.isLoading && (
                    <span className="ml-auto text-[12px] font-normal tabular-nums text-text-subtle">
                      {state.tables.length}
                    </span>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent>{renderTables(schema, true)}</CollapsibleContent>
              </Collapsible>
            )
          })
        )}
      </SidebarSection>
    </div>
  )
}

interface TableRowProps {
  index: number
  connectionId: string
  schema: string
  table: TableInfo
  isActive: boolean
  isPinned: boolean
  onSelect: (schema: string, table: string) => void
  onTogglePin: (ref: TableRef) => void
  onNavigate: (to: string) => void
  onDropped: (schema: string, table: string) => void
}

/**
 * Memoised because a schema can render 200 of these, each with its own actions
 * menu, and the tree re-renders on every navigation: every prop here is stable
 * unless the row itself changed.
 */
const TableRow = React.memo(function TableRow({
  index,
  connectionId,
  schema,
  table,
  isActive,
  isPinned,
  onSelect,
  onTogglePin,
  onNavigate,
  onDropped
}: TableRowProps) {
  const isView = table.type === 'view' || table.type === 'materialized_view'
  const togglePin = React.useCallback(
    () => onTogglePin({ schema, table: table.name }),
    [onTogglePin, schema, table.name]
  )
  return (
    <SlidingHoverList.Item
      as="div"
      index={index}
      className={cn(
        'group/row flex h-7 w-full items-center gap-0.5 rounded-lg',
        isActive && 'bg-surface-active'
      )}
    >
      <button
        onClick={() => onSelect(schema, table.name)}
        aria-current={isActive ? 'page' : undefined}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg pl-2 text-left text-sm font-medium text-text"
        title={table.name}
      >
        <TableTile name={table.name} isView={isView} />
        <span className="truncate">{table.name}</span>
        {isView ? (
          <span className="ml-auto pr-1 text-[12px] font-normal text-text-subtle">view</span>
        ) : (
          table.estimatedRows != null && (
            // Marked approximate to agree with the table header: this is the
            // engine's statistic, not a count. Zero is a real answer and stays.
            <span
              className="ml-auto pr-1 text-[12px] font-normal tabular-nums text-text-subtle opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100"
              title={`About ${formatNumber(table.estimatedRows)} rows, from table statistics`}
            >
              ~{formatNumber(table.estimatedRows)}
            </span>
          )
        )}
      </button>
      {isPinned && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            togglePin()
          }}
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-warning transition-colors hover:bg-surface"
          aria-label="Unpin table"
          title="Unpin table"
        >
          <IconPinFilled size={12} />
        </button>
      )}
      <TableActionsMenu
        connectionId={connectionId}
        schema={schema}
        table={table}
        isPinned={isPinned}
        onTogglePin={togglePin}
        onNavigate={onNavigate}
        onDropped={onDropped}
      />
    </SlidingHoverList.Item>
  )
})

/** Attio's collapsible sidebar group: a quiet chevron-led label over its rows. */
function SidebarSection({
  title,
  actions,
  children
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = React.useState(true)
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="px-2">
      <div className="group/section flex h-7 items-center gap-1 pr-1">
        <CollapsibleTrigger className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-lg px-2 text-left text-[13px] font-medium text-text-subtle transition-colors hover:text-text-muted">
          <IconChevronRight
            size={12}
            stroke={2}
            className={cn('shrink-0 transition-transform duration-200', isOpen && 'rotate-90')}
          />
          <span className="truncate">{title}</span>
        </CollapsibleTrigger>
        {actions && (
          <div className="flex items-center opacity-0 transition-opacity group-hover/section:opacity-100 focus-within:opacity-100">
            {actions}
          </div>
        )}
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-px pt-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function TableTile({ name, isView }: { name: string; isView: boolean }) {
  const Icon = isView ? IconEye : IconTable
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-[4px] text-white',
        isView ? 'bg-tag-slate' : tileColor(name)
      )}
    >
      <Icon size={11} stroke={2.25} />
    </span>
  )
}

/** The sidebar's Favorites and Tables sections for the connected database. */
export function SidebarTables({ connectionId }: { connectionId: string }) {
  const { data, error, isLoading, refresh } = useAsync(
    async () => unwrap(window.api.db.listSchemas(connectionId)),
    [connectionId]
  )
  const schemas = React.useMemo(() => (data ?? []).map((s) => s.name), [data])
  if (error) {
    return (
      <div className="px-3 pt-4">
        <ErrorState message={error} onRetry={refresh} />
      </div>
    )
  }
  return (
    <SchemaTree
      // Keyed so pins, expansion and cached table lists reset on a new connection.
      key={connectionId}
      connectionId={connectionId}
      schemas={schemas}
      onRefresh={refresh}
      isLoading={isLoading}
    />
  )
}

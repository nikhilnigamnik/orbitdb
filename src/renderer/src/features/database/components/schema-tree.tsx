import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IconChevronRight,
  IconTable,
  IconEye,
  IconLoader,
  IconRefresh,
  IconSearch,
  IconDatabase
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { useCommandPalette } from '@renderer/features/command-palette/store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import { formatNumber } from '@renderer/lib/format'
import { tableRoute } from '@renderer/config/routes'
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

export function SchemaTree({ connectionId, schemas, onRefresh, isLoading }: SchemaTreeProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeSchema = searchParams.get('schema') ?? ''
  const activeTable = searchParams.get('table') ?? ''

  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(['public']))
  const [tablesBySchema, setTablesBySchema] = React.useState<Record<string, TablesState>>({})
  const { open: openPalette } = useCommandPalette()

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

  React.useEffect(() => {
    if (activeSchema && !expanded.has(activeSchema)) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.add(activeSchema)
        return next
      })
    }
  }, [activeSchema, expanded])

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

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-4 pb-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
              <IconDatabase size={13} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[12.5px] font-semibold text-text">Schemas</span>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-text-subtle hover:bg-surface-elevated hover:text-text"
                onClick={() => {
                  setTablesBySchema({})
                  onRefresh()
                }}
                aria-label="Refresh schemas"
              >
                <IconRefresh size={12} className={isLoading ? 'animate-spin' : ''} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh schemas</TooltipContent>
          </Tooltip>
        </div>
        <button
          type="button"
          onClick={openPalette}
          aria-label="Open command palette"
          className="group flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-elevated/40 px-2.5 text-left text-[12px] text-text-subtle transition-colors hover:border-border-strong hover:bg-surface-elevated hover:text-text-muted"
        >
          <IconSearch size={12} className="shrink-0" />
          <span className="flex-1 truncate">Search tables…</span>
          <span className="flex shrink-0 items-center gap-0.5">
            <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-surface px-1 font-mono text-[10px] leading-none text-text-subtle">
              {isMac ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-surface px-1 font-mono text-[10px] leading-none text-text-subtle">
              K
            </kbd>
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {isLoading && schemas.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-text-subtle">
            <IconLoader stroke={2} size={18} className="animate-spin" />
          </div>
        ) : schemas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 px-4 text-center">
            <IconDatabase size={20} className="text-text-subtle" />
            <p className="text-[12px] font-medium text-text">No schemas</p>
            <p className="text-[10.5px] text-text-subtle">This database has no visible schemas.</p>
          </div>
        ) : (
          schemas.map((schema) => {
            const isOpen = expanded.has(schema)
            const state = tablesBySchema[schema]
            const allTables = state?.tables ?? []
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
                    'group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12.5px] font-medium transition-colors',
                    isSchemaActive
                      ? 'text-text'
                      : 'text-text-muted hover:bg-surface-elevated/40 hover:text-text'
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
                    <span className="ml-auto text-[10px] text-text-subtle">
                      {allTables.length}
                    </span>
                  )}
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="ml-3 mt-0.5 pl-2">
                    {state?.isLoading ? (
                      <div className="flex items-center justify-center px-3 py-3 text-text-subtle">
                        <IconLoader stroke={2} size={14} className="animate-spin" />
                      </div>
                    ) : state?.error ? (
                      <p className="px-3 py-1.5 text-[11px] text-red-400/80">{state.error}</p>
                    ) : allTables.length === 0 ? (
                      <p className="px-3 py-1.5 text-[11px] text-text-subtle">Empty schema</p>
                    ) : (
                      allTables.map((table) => {
                        const isActive = isSchemaActive && activeTable === table.name
                        const isView = table.type === 'view' || table.type === 'materialized_view'
                        const Icon = isView ? IconEye : IconTable
                        return (
                          <button
                            key={table.name}
                            onClick={() => selectTable(schema, table)}
                            className={cn(
                              'group/row flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]',
                              isActive
                                ? 'bg-surface-elevated text-text'
                                : 'text-text-muted hover:bg-surface-elevated/50 hover:text-text'
                            )}
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
                            {isView && (
                              <span className="ml-auto rounded bg-surface-elevated px-1 py-0 text-[9px] font-medium uppercase tracking-wide text-text-subtle">
                                view
                              </span>
                            )}
                            {!isView && table.estimatedRows != null && table.estimatedRows > 0 && (
                              <span className="ml-auto font-mono text-[10px] text-text-subtle opacity-0 transition-opacity group-hover/row:opacity-100">
                                {formatNumber(table.estimatedRows)}
                              </span>
                            )}
                          </button>
                        )
                      })
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

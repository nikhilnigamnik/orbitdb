import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IconChevronDown,
  IconChevronRight,
  IconTable,
  IconEye,
  IconRefresh,
  IconSearch
} from '@tabler/icons-react'
import { Spinner } from '@renderer/components/ui/spinner'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
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
  const [filter, setFilter] = React.useState('')

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

  const lowered = filter.trim().toLowerCase()
  function matchesFilter(value: string) {
    return !lowered || value.toLowerCase().includes(lowered)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
            Schemas
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-[var(--color-text-subtle)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]"
            onClick={() => {
              setTablesBySchema({})
              onRefresh()
            }}
            title="Refresh"
          >
            <IconRefresh size={11} className={isLoading ? 'animate-spin' : ''} />
          </Button>
        </div>
        <div className="relative">
          <IconSearch
            size={11}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search…"
            className="h-7 border-transparent bg-[var(--color-surface-elevated)] pl-7 text-[12px] focus-visible:border-[var(--color-border-strong)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1.5 pb-2">
        {isLoading && schemas.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={14} />
          </div>
        ) : schemas.length === 0 ? (
          <p className="px-3 py-2 text-[11.5px] text-[var(--color-text-subtle)]">No schemas.</p>
        ) : (
          schemas.filter(matchesFilter).map((schema) => {
            const isOpen = expanded.has(schema)
            const state = tablesBySchema[schema]
            const filteredTables = state?.tables.filter((t) => matchesFilter(t.name)) ?? []
            return (
              <div key={schema} className="mb-0.5">
                <button
                  onClick={() => toggleSchema(schema)}
                  className={cn(
                    'flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[12px] font-medium transition-colors',
                    activeSchema === schema
                      ? 'text-[var(--color-text)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  )}
                >
                  {isOpen ? (
                    <IconChevronDown size={11} className="text-[var(--color-text-subtle)]" />
                  ) : (
                    <IconChevronRight size={11} className="text-[var(--color-text-subtle)]" />
                  )}
                  <span className="truncate">{schema}</span>
                </button>

                {isOpen && (
                  <div className="ml-2 mt-0.5 pl-1">
                    {state?.isLoading ? (
                      <div className="px-3 py-1">
                        <Spinner size={11} />
                      </div>
                    ) : state?.error ? (
                      <p className="px-3 py-1 text-[11px] text-red-400/80">{state.error}</p>
                    ) : filteredTables.length === 0 ? (
                      <p className="px-3 py-1 text-[11px] text-[var(--color-text-subtle)]">
                        {lowered ? 'No matches' : 'Empty'}
                      </p>
                    ) : (
                      filteredTables.map((table) => {
                        const isActive = activeSchema === schema && activeTable === table.name
                        const Icon =
                          table.type === 'view' || table.type === 'materialized_view'
                            ? IconEye
                            : IconTable
                        return (
                          <button
                            key={table.name}
                            onClick={() => selectTable(schema, table)}
                            className={cn(
                              'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] transition-colors',
                              isActive
                                ? 'bg-[var(--color-surface-elevated)] text-[var(--color-text)]'
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]/50 hover:text-[var(--color-text)]'
                            )}
                            title={table.name}
                          >
                            <Icon
                              size={11}
                              className={cn(
                                'shrink-0',
                                isActive
                                  ? 'text-[var(--color-text-muted)]'
                                  : 'text-[var(--color-text-subtle)]'
                              )}
                            />
                            <span className="truncate">{table.name}</span>
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

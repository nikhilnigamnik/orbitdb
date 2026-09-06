/**
 * The page of rows on screen, and everything that decides which page that is.
 *
 * Sort, page size and the remembered preferences live here with the load itself
 * because they are its inputs: a change to any of them is a reload, and keeping
 * them beside it is what lets `load` stay a single callback with one dependency
 * list rather than a web of effects.
 */

import * as React from 'react'
import { useToast } from '@renderer/components/ui/toast'
import { unwrap } from '@renderer/lib/ipc'
import { loadErrorAction } from '../lib/load-error-action'
import { loadViewPrefs, type TableViewPrefs } from '../lib/view-prefs'
import type {
  ColumnInfo,
  FilterJoin,
  RowFilter,
  RowsResult,
  SortDirection,
  TableDetails
} from '@renderer/types'

/** The filter set behind a load, kept so a broken one can be walked back. */
interface FilterQueryState {
  filters: RowFilter[]
  filterJoin: FilterJoin
}

interface TableRowsOptions {
  connectionId: string
  details: TableDetails
  filters: RowFilter[]
  filterJoin: FilterJoin
  offset: number
  setOffset: (offset: number) => void
  setFilters: (filters: RowFilter[]) => void
  setFiltersState: React.Dispatch<React.SetStateAction<RowFilter[]>>
  setFilterJoinState: React.Dispatch<React.SetStateAction<FilterJoin>>
  writeFilterParams: (filters: RowFilter[], join: FilterJoin) => void
  setRowSelection: (selection: Record<string, boolean>) => void
  onReady?: () => void
}

export function useTableRows({
  connectionId,
  details,
  filters,
  filterJoin,
  offset,
  setOffset,
  setFilters,
  setFiltersState,
  setFilterJoinState,
  writeFilterParams,
  setRowSelection,
  onReady
}: TableRowsOptions) {
  const toast = useToast()
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = React.useState<ColumnInfo[]>(details.columns)
  const [totalEstimate, setTotalEstimate] = React.useState<number | null>(details.estimatedRows)
  /** Exact count for the current filters, once it lands. Null while unknown. */
  const [totalExact, setTotalExact] = React.useState<number | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Sort, page size, hidden columns and widths are remembered per table, so a
  // view you set up is still set up next time you open it.
  const [prefs, setPrefs] = React.useState<TableViewPrefs>(() =>
    loadViewPrefs(connectionId, details.schema, details.name)
  )
  const [pageSize, setPageSize] = React.useState(prefs.pageSize)
  const [orderBy, setOrderBy] = React.useState<string | null>(prefs.orderBy)
  const [orderDir, setOrderDir] = React.useState<SortDirection>(prefs.orderDir)

  const requestIdRef = React.useRef(0)
  const prefetchCacheRef = React.useRef<{ key: string; data: RowsResult } | null>(null)
  // Read inside load itself: as state they would have to be dependencies, and a
  // load that reloads whenever its own outcome changes never settles.
  const hasLoadedOnceRef = React.useRef(false)
  const loadRef = React.useRef<() => Promise<void>>(async () => {})
  // The last filter set that actually loaded, so a load that breaks can offer to
  // go back to it rather than a Refresh that re-runs the same failing query.
  const lastGoodQueryRef = React.useRef<FilterQueryState | null>(null)
  const revertRef = React.useRef<() => void>(() => {})

  const load = React.useCallback(async () => {
    const requestId = ++requestIdRef.current
    const queryKey = JSON.stringify({
      connectionId,
      schema: details.schema,
      table: details.name,
      pageSize,
      offset,
      orderBy,
      orderDir,
      filters,
      filterJoin
    })

    let data: RowsResult
    const cached = prefetchCacheRef.current
    if (cached?.key === queryKey) {
      data = cached.data
      prefetchCacheRef.current = null
      setRows(data.rows)
      setColumns(data.columns)
      setTotalEstimate(data.totalEstimate)
      setRowSelection({})
      setHasLoadedOnce(true)
      setIsLoading(false)
      setError(null)
      lastGoodQueryRef.current = { filters, filterJoin }
    } else {
      prefetchCacheRef.current = null
      setIsLoading(true)
      setError(null)
      try {
        data = await unwrap(
          window.api.db.getRows({
            connectionId,
            schema: details.schema,
            table: details.name,
            limit: pageSize,
            offset,
            orderBy: orderBy ?? undefined,
            orderDir,
            filters,
            filterJoin
          })
        )
        if (requestId !== requestIdRef.current) return
        setRows(data.rows)
        setColumns(data.columns)
        setTotalEstimate(data.totalEstimate)
        setRowSelection({})
        setHasLoadedOnce(true)
        hasLoadedOnceRef.current = true
        lastGoodQueryRef.current = { filters, filterJoin }
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        // Only once a grid is on screen. Before that the full-area error state
        // is the whole view, and a toast on top of it would say it twice.
        if (hasLoadedOnceRef.current) {
          const isFilterFault =
            loadErrorAction({ filters, filterJoin }, lastGoodQueryRef.current) === 'undo'
          toast.error('Could not load rows', {
            description: message,
            action: isFilterFault
              ? { label: 'Undo filters', onClick: () => revertRef.current() }
              : { label: 'Refresh', onClick: () => void loadRef.current() }
          })
        }
        return
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false)
      }
    }

    const nextOffset = offset + pageSize
    const hasNextPage =
      data.rows.length === pageSize &&
      (data.totalEstimate == null || nextOffset < data.totalEstimate)
    if (!hasNextPage) return

    const nextKey = JSON.stringify({
      connectionId,
      schema: details.schema,
      table: details.name,
      pageSize,
      offset: nextOffset,
      orderBy,
      orderDir,
      filters,
      filterJoin
    })

    void (async () => {
      try {
        const nextData: RowsResult = await unwrap(
          window.api.db.getRows({
            connectionId,
            schema: details.schema,
            table: details.name,
            limit: pageSize,
            offset: nextOffset,
            orderBy: orderBy ?? undefined,
            orderDir,
            filters,
            filterJoin
          })
        )
        prefetchCacheRef.current = { key: nextKey, data: nextData }
      } catch {
        // silent - prefetch failures shouldn't surface
      }
    })()
  }, [
    connectionId,
    details.schema,
    details.name,
    pageSize,
    offset,
    orderBy,
    orderDir,
    filters,
    filterJoin,
    setRowSelection,
    toast
  ])

  loadRef.current = load

  // Restores the last filter set that loaded. It must write the URL too -
  // leaving the poisoned ?filters= behind would resurrect it on the next reload.
  const revertToLastGood = React.useCallback(() => {
    const lastGood = lastGoodQueryRef.current
    if (!lastGood) return
    setFiltersState(lastGood.filters)
    setFilterJoinState(lastGood.filterJoin)
    writeFilterParams(lastGood.filters, lastGood.filterJoin)
    setOffset(0)
    // The three setters are plain useState setters threaded in from the view, so
    // naming them here costs nothing; only writeFilterParams actually changes.
  }, [writeFilterParams, setFiltersState, setFilterJoinState, setOffset])

  revertRef.current = revertToLastGood

  // Only on an actual table change. The container keys this component by table,
  // so in practice a switch remounts and this never fires - but it must not fire
  // on mount either, because clearing the filters there throws away the ones a
  // deep link arrived with, and an FK jump is exactly that.
  const loadedForRef = React.useRef(`${details.schema}.${details.name}`)
  React.useEffect(() => {
    const tableKey = `${details.schema}.${details.name}`
    if (loadedForRef.current === tableKey) return
    loadedForRef.current = tableKey

    const restored = loadViewPrefs(connectionId, details.schema, details.name)
    setPrefs(restored)
    setOffset(0)
    setOrderBy(restored.orderBy)
    setOrderDir(restored.orderDir)
    setPageSize(restored.pageSize)
    setFilters([])
    setRows([])
    setRowSelection({})
    setHasLoadedOnce(false)
    hasLoadedOnceRef.current = false
    prefetchCacheRef.current = null
    // setFilters is rebuilt whenever the join changes, so it does re-run this -
    // harmlessly, because the guard above returns unless the table really moved.
  }, [connectionId, details.schema, details.name, setFilters, setOffset, setRowSelection])

  React.useEffect(() => {
    void load()
  }, [load])

  // The count runs alongside the page rather than gating it: the rows appear
  // immediately and the total sharpens from estimate to exact when it arrives.
  React.useEffect(() => {
    let cancelled = false
    setTotalExact(null)
    void unwrap(
      window.api.db.countRows({
        connectionId,
        schema: details.schema,
        table: details.name,
        filters,
        filterJoin
      })
    )
      .then((total) => {
        if (!cancelled) setTotalExact(total)
      })
      .catch(() => {
        // A count is an enhancement - falling back to the estimate is fine.
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, details.schema, details.name, filters, filterJoin])

  // Signal the container once the first page lands, so it can reveal the header
  // and grid together - a single loader instead of loader-then-loader.
  const onReadyRef = React.useRef(onReady)
  onReadyRef.current = onReady
  React.useEffect(() => {
    if (hasLoadedOnce) onReadyRef.current?.()
  }, [hasLoadedOnce])

  return {
    rows,
    setRows,
    columns,
    setColumns,
    totalEstimate,
    totalExact,
    isLoading,
    hasLoadedOnce,
    error,
    prefs,
    setPrefs,
    pageSize,
    setPageSize,
    orderBy,
    setOrderBy,
    orderDir,
    setOrderDir,
    load,
    revertToLastGood,
    prefetchCacheRef
  }
}

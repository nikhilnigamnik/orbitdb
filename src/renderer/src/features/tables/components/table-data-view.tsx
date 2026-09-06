import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { RowSelectionState } from '@tanstack/react-table'
import {
  IconArrowBackUp,
  IconArrowNarrowRight,
  IconDownload,
  IconSeeding,
  IconTrash,
  IconX
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Kbd } from '@renderer/components/ui/kbd'
import { Chip } from '@renderer/components/ui/chip'
import { useToast } from '@renderer/components/ui/toast'
import { AiPrompt } from '@renderer/features/query/components/ai-prompt'
import { SeedDataDialog } from '@renderer/features/database/components/seed-data-dialog'
import { ErrorState } from '@renderer/components/common/error-state'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { LoadingState } from '@renderer/components/common/loading-state'
import { formatCellValue, formatNumber } from '@renderer/lib/format'
import { errorMessage } from '@renderer/lib/errors'
import { isForeignKeyError } from '@renderer/features/tables/lib/delete-error'
import { isMissingAiKeyError } from '@renderer/components/common/ai-key-required'
import { cn } from '@renderer/lib/utils'
import { unwrap } from '@renderer/lib/ipc'
import {
  FILTERS_PARAM,
  JOIN_PARAM,
  decodeFilters,
  decodeJoin,
  filterParamsKey,
  readFilterParamsKey,
  encodeFilters
} from '@renderer/features/tables/lib/filter-params'
import {
  loadErrorAction,
  type FilterQueryState
} from '@renderer/features/tables/lib/load-error-action'
import { buildFilterSuggestions } from '@renderer/features/tables/lib/filter-suggestions'
import {
  MAX_FROZEN_COLUMNS,
  loadViewPrefs,
  saveViewPrefs,
  toggleFrozenColumn,
  toggleHiddenColumn,
  type TableViewPrefs
} from '@renderer/features/tables/lib/view-prefs'
import { applyViewToPrefs, captureView } from '@renderer/features/tables/lib/saved-views'
import { useSavedViews } from '@renderer/features/tables/hooks/use-saved-views'
import { UNDO_PROMPT_MS } from '@renderer/config/site'
import { ROUTES, tableRouteWithFk } from '@renderer/config/routes'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import type {
  ColumnInfo,
  DatabaseEngine,
  FilterJoin,
  RowFilter,
  RowsResult,
  SavedTableView,
  SortDirection,
  TableDetails
} from '@renderer/types'
import { DataGrid } from './data-grid'
import { ExportMenu } from './export-menu'
import { TableOverflowMenu } from './table-overflow-menu'
import { FiltersBar } from './filters-bar'
import { PaginationBar } from './pagination-bar'
import { RowEditorSheet } from './row-editor-sheet'
import { RecordViewSheet } from './record-view-sheet'
import { ColumnVisibilityMenu } from './column-visibility-menu'
import { SavedViewsMenu } from './saved-views-menu'
import { CascadeDeleteDialog } from './cascade-delete-dialog'
import type { CopyFormat } from '../hooks/use-grid-cursor'

interface TableDataViewProps {
  connectionId: string
  details: TableDetails
  /** Decides the quoting used by `copy as INSERT`. */
  engine?: DatabaseEngine
  /** Opens the DDL rename dialog (table-only); surfaced in the overflow menu. */
  onRenameTable?: () => void
  /** Fires once the first page of rows has loaded, so the container can reveal chrome. */
  onReady?: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const COPY_FORMAT_LABEL: Record<CopyFormat, string> = {
  tsv: 'text',
  json: 'JSON',
  sql: 'SQL'
}

export function TableDataView({
  connectionId,
  details,
  engine = 'postgres',
  onRenameTable,
  onReady
}: TableDataViewProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const fkColumn = searchParams.get('fkColumn')
  const fkValue = searchParams.get('fkValue')

  const [rows, setRows] = React.useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = React.useState<ColumnInfo[]>(details.columns)
  const [totalEstimate, setTotalEstimate] = React.useState<number | null>(details.estimatedRows)
  /** Exact count for the current filters, once it lands. Null while unknown. */
  const [totalExact, setTotalExact] = React.useState<number | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [offset, setOffset] = React.useState(0)
  // Sort, page size, hidden columns and widths are remembered per table, so a
  // view you set up is still set up next time you open it.
  const [prefs, setPrefs] = React.useState<TableViewPrefs>(() =>
    loadViewPrefs(connectionId, details.schema, details.name)
  )
  const [pageSize, setPageSize] = React.useState(prefs.pageSize)
  const [orderBy, setOrderBy] = React.useState<string | null>(prefs.orderBy)
  const [orderDir, setOrderDir] = React.useState<SortDirection>(prefs.orderDir)
  // Filters live in the URL so a filtered view can be linked and reopened -
  // an FK deep link already worked that way while a hand-built filter did not.
  const [filters, setFiltersState] = React.useState<RowFilter[]>(() => {
    const fromUrl = decodeFilters(searchParams.get(FILTERS_PARAM))
    if (fromUrl.length > 0) return fromUrl
    if (fkColumn && fkValue != null) {
      return [{ column: fkColumn, operator: '=', value: fkValue }]
    }
    return []
  })
  const [filterJoin, setFilterJoinState] = React.useState<FilterJoin>(() =>
    decodeJoin(searchParams.get(JOIN_PARAM))
  )

  // The last params this component put in the URL. Anything else appearing
  // there arrived from outside - a value-search hit, an FK jump, the back
  // button - and has to be adopted. Comparing against our own last write rather
  // than against current state avoids fighting the render where one has updated
  // and the other has not.
  const lastWrittenParamsRef = React.useRef(readFilterParamsKey(searchParams))

  const writeFilterParams = React.useCallback(
    (next: RowFilter[], join: FilterJoin) => {
      lastWrittenParamsRef.current = filterParamsKey(next, join)
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          const encoded = encodeFilters(next)
          if (encoded) params.set(FILTERS_PARAM, encoded)
          else params.delete(FILTERS_PARAM)
          if (join === 'or' && next.length > 1) params.set(JOIN_PARAM, join)
          else params.delete(JOIN_PARAM)
          return params
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const setFilters = React.useCallback(
    (next: RowFilter[]) => {
      setFiltersState(next)
      writeFilterParams(next, filterJoin)
    },
    [filterJoin, writeFilterParams]
  )

  const setFilterJoin = React.useCallback(
    (join: FilterJoin) => {
      setFilterJoinState(join)
      writeFilterParams(filters, join)
    },
    [filters, writeFilterParams]
  )

  /**
   * Adopt filters that arrived in the URL from somewhere else.
   *
   * `filters` is seeded from the URL by a lazy initialiser, which runs once. The
   * container keys this component by `schema.table`, so landing on a table you
   * are *already* looking at - which is what a value-search hit on the open
   * table does - never remounts it, and the new filters were simply ignored.
   */
  React.useEffect(() => {
    const key = readFilterParamsKey(searchParams)
    if (key === lastWrittenParamsRef.current) return
    lastWrittenParamsRef.current = key
    setFiltersState(decodeFilters(searchParams.get(FILTERS_PARAM)))
    setFilterJoinState(decodeJoin(searchParams.get(JOIN_PARAM)))
    // Page 1: the row that matched is unlikely to be at the old offset.
    setOffset(0)
  }, [searchParams])

  const fkByColumn = React.useMemo(() => {
    const map = new Map<string, { schema: string; table: string; column: string }>()
    for (const fk of details.foreignKeys) {
      if (fk.columns.length !== 1 || fk.referencedColumns.length !== 1) continue
      map.set(fk.columns[0], {
        schema: fk.referencedSchema,
        table: fk.referencedTable,
        column: fk.referencedColumns[0]
      })
    }
    return map
  }, [details.foreignKeys])

  const openForeignKey = React.useCallback(
    (column: string, value: unknown) => {
      const target = fkByColumn.get(column)
      if (!target || value == null) return
      navigate(tableRouteWithFk(target.schema, target.table, target.column, String(value)))
    },
    [fkByColumn, navigate]
  )

  // Built from introspection rather than the grid's columns: `details.columns`
  // is where enumValues lives, and an enum label is the one example value we can
  // offer without querying the rows.
  const aiSuggestions = React.useMemo(
    () => buildFilterSuggestions(details.columns),
    [details.columns]
  )

  const aiPrompt = useDisclosure(false)
  const seedDialog = useDisclosure(false)
  const [isAiFiltering, setIsAiFiltering] = React.useState(false)

  const openAiPrompt = aiPrompt.open
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        openAiPrompt()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [openAiPrompt])
  const insertModal = useDisclosure(false)
  const editModal = useDisclosure(false)
  const recordView = useDisclosure(false)
  const [inspectingRow, setInspectingRow] = React.useState<Record<string, unknown> | null>(null)
  const deleteConfirm = useDisclosure(false)
  const bulkDeleteConfirm = useDisclosure(false)
  const cascadeDialog = useDisclosure(false)
  const [editingRow, setEditingRow] = React.useState<Record<string, unknown> | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<Record<string, unknown> | null>(null)
  // Held separately from the selection: the rows a cascade was offered for are
  // the ones the failed delete was aiming at, and clearing the grid selection
  // afterwards must not change what the dialog is about.
  const [cascadeTargets, setCascadeTargets] = React.useState<Record<string, unknown>[]>([])
  const [isMutating, setIsMutating] = React.useState(false)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const selectedRows = React.useMemo(
    () =>
      Object.keys(rowSelection)
        .filter((key) => rowSelection[key])
        .map((key) => rows[Number(key)])
        .filter(Boolean),
    [rowSelection, rows]
  )
  const selectedCount = selectedRows.length

  const canMutate = details.type === 'table' && details.primaryKey.length > 0

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
  }, [writeFilterParams])

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
  }, [connectionId, details.schema, details.name])

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

  /**
   * Writes the view preferences through. Called at each mutation point rather
   * than from an effect watching the state: on a table change the effect would
   * still be holding the previous table's sort and would save it under the new
   * table's key.
   */
  function persistPrefs(patch: Partial<TableViewPrefs>) {
    const next: TableViewPrefs = { ...prefs, orderBy, orderDir, pageSize, ...patch }
    setPrefs(next)
    saveViewPrefs(connectionId, details.schema, details.name, next)
  }

  // Named ways of looking at this table, kept in userData rather than beside the
  // widths in localStorage: a view the user named is theirs, not view state.
  const currentView = React.useMemo(
    () => captureView({ filters, filterJoin, orderBy, orderDir, prefs }),
    [filters, filterJoin, orderBy, orderDir, prefs]
  )
  const savedViews = useSavedViews(
    { connectionId, schema: details.schema, table: details.name },
    currentView
  )

  function applySavedView(view: SavedTableView) {
    const nextPrefs = applyViewToPrefs(view.view, prefs)
    setPrefs(nextPrefs)
    saveViewPrefs(connectionId, details.schema, details.name, nextPrefs)
    setOrderBy(view.view.orderBy)
    setOrderDir(view.view.orderDir)
    setPageSize(view.view.pageSize)
    // Both filter pieces at once, so the URL is written from the pair rather
    // than from one of them and whatever the other still held this render.
    setFiltersState(view.view.filters)
    setFilterJoinState(view.view.filterJoin)
    writeFilterParams(view.view.filters, view.view.filterJoin)
    setOffset(0)
    savedViews.markApplied(view.id)
  }

  function handleSort(column: string) {
    let nextOrderBy: string | null = column
    let nextOrderDir: SortDirection = 'asc'
    if (orderBy === column) {
      if (orderDir === 'asc') {
        nextOrderDir = 'desc'
      } else {
        nextOrderBy = null
      }
    }
    setOrderBy(nextOrderBy)
    setOrderDir(nextOrderDir)
    setOffset(0)
    persistPrefs({ orderBy: nextOrderBy, orderDir: nextOrderDir })
  }

  const visibleColumns = React.useMemo(
    () => columns.filter((column) => !prefs.hiddenColumns.includes(column.name)),
    [columns, prefs.hiddenColumns]
  )

  async function handleAiFilter(prompt: string) {
    setIsAiFiltering(true)
    try {
      const result = await unwrap(
        window.api.ai.filterTable({
          connectionId,
          schema: details.schema,
          table: details.name,
          prompt
        })
      )
      // Every condition was dropped. Applying an empty filter set would widen the
      // view to the whole table and read as an answer - say so and let the user
      // rephrase instead.
      if (result.filters.length === 0 && result.notes?.length) {
        toast.warning('Could not build that filter', { description: result.notes.join('\n') })
        return
      }
      setFilters(result.filters)
      setOrderBy(result.orderBy ?? null)
      setOrderDir(result.orderDir ?? 'asc')
      setOffset(0)
      aiPrompt.close()
      if (result.notes?.length) {
        toast.warning('Some conditions were dropped', { description: result.notes.join('\n') })
      }
    } catch (err) {
      const message = errorMessage(err)
      // A missing key is a setup step, not a failure - say what to do about it.
      if (isMissingAiKeyError(message)) {
        toast.error('AI needs an Anthropic API key', {
          description: 'It stays encrypted on this machine.',
          action: { label: 'Open settings', onClick: () => navigate(ROUTES.settings) }
        })
      } else {
        toast.error('AI filter failed', { description: message })
      }
    } finally {
      setIsAiFiltering(false)
    }
  }

  async function handleInsert(values: Record<string, unknown>) {
    await unwrap(
      window.api.db.insertRow({
        connectionId,
        schema: details.schema,
        table: details.name,
        values
      })
    )
    await load()
  }

  async function handleUpdate(values: Record<string, unknown>) {
    if (!editingRow) throw new Error('No row selected')
    const pk: Record<string, unknown> = {}
    for (const key of details.primaryKey) pk[key] = editingRow[key]
    await unwrap(
      window.api.db.updateRow({
        connectionId,
        schema: details.schema,
        table: details.name,
        pk,
        values
      })
    )
    await load()
  }

  /**
   * The last committed cell edit, kept so it can be put back. A cell edit writes
   * the moment you leave the cell, with no confirmation - this is the only way
   * back from a mistyped value.
   */
  const [lastEdit, setLastEdit] = React.useState<{
    pk: Record<string, unknown>
    column: string
    previousValue: unknown
    newValue: unknown
  } | null>(null)
  // The prompt is a hint, not the capability: it fades, but cmd-Z keeps working
  // until another edit replaces it or the table changes. Tying the two together
  // meant that looking away for a few seconds silently cost you the undo.
  const [isUndoPromptVisible, setIsUndoPromptVisible] = React.useState(false)
  const [isUndoing, setIsUndoing] = React.useState(false)

  React.useEffect(() => {
    if (!lastEdit) return
    const timer = setTimeout(() => setIsUndoPromptVisible(false), UNDO_PROMPT_MS)
    return () => clearTimeout(timer)
  }, [lastEdit])

  // The row marker points at the prompt, so it leaves with it. Bound to lastEdit
  // instead it would outlive the bar and sit there highlighted forever.
  const pendingUndoRow = isUndoPromptVisible ? (lastEdit?.pk ?? null) : null

  async function writeCell(
    pk: Record<string, unknown>,
    column: string,
    value: unknown,
    matchRow?: Record<string, unknown>
  ) {
    const updated = await unwrap(
      window.api.db.updateRow({
        connectionId,
        schema: details.schema,
        table: details.name,
        pk,
        values: { [column]: value }
      })
    )
    prefetchCacheRef.current = null
    setRows((prev) =>
      prev.map((r) => {
        const isTarget = matchRow
          ? r === matchRow
          : details.primaryKey.every((key) => r[key] === pk[key])
        if (!isTarget) return r
        // mysql/d1 re-fetch by PK can miss (e.g. concurrent delete) and return
        // {}; fall back to a local merge rather than blanking the row.
        return Object.keys(updated).length > 0 ? updated : { ...r, [column]: value }
      })
    )
  }

  async function undoLastEdit() {
    if (!lastEdit || isUndoing) return
    setIsUndoing(true)
    try {
      await writeCell(lastEdit.pk, lastEdit.column, lastEdit.previousValue)
      setLastEdit(null)
    } catch (err) {
      toast.error('Undo failed', { description: errorMessage(err) })
    } finally {
      setIsUndoing(false)
    }
  }

  React.useEffect(() => {
    if (!lastEdit) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey) return
      const target = e.target as HTMLElement | null
      // Inside a field, cmd-Z is the browser's own text undo.
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      void undoLastEdit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function handleEditCell(row: Record<string, unknown>, column: string, value: unknown) {
    const pk: Record<string, unknown> = {}
    for (const key of details.primaryKey) pk[key] = row[key]
    const previousValue = row[column]
    // Patches the saved row in place with what the DB returned (covers
    // triggers/defaults) instead of reloading - no grid flash, and the
    // cell-editing session survives for Tab navigation.
    await writeCell(pk, column, value, row)
    setLastEdit({ pk, column, previousValue, newValue: value })
    setIsUndoPromptVisible(true)
  }

  function pkOf(row: Record<string, unknown>): Record<string, unknown> {
    const pk: Record<string, unknown> = {}
    for (const key of details.primaryKey) pk[key] = row[key]
    return pk
  }

  /**
   * A refused delete, reported as the thing it is.
   *
   * The raw constraint error is accurate but names nothing the user can act on -
   * SQLite does not even say which table is holding the row - so it becomes an
   * offer to look, and the plan behind that offer does the naming. Cascading
   * needs a primary key to walk from, so without one the error stands as it is.
   */
  function reportDeleteFailure(
    err: unknown,
    targets: Record<string, unknown>[],
    deletedCount = 0
  ): void {
    const message = errorMessage(err)
    // A bulk delete can land some rows and be refused on others. Reporting only
    // the refusal left the grid quietly shorter than the user was told.
    const partial =
      deletedCount > 0
        ? `${formatNumber(deletedCount)} row${deletedCount === 1 ? '' : 's'} deleted first. `
        : ''

    if (!isForeignKeyError(message) || details.primaryKey.length === 0) {
      toast.error('Delete failed', { description: `${partial}${message}` })
      return
    }

    const pks = targets.map(pkOf)
    toast.error('Other rows still point at this', {
      description: `${partial}The database refused the delete while something still references it.`,
      // The rows are pinned on the action rather than read back from state, so a
      // toast still on screen after a successful cascade reopens on the rows it
      // was raised for - planning those finds nothing left, which is an honest
      // empty plan rather than the "no primary key values" internal error an
      // already-cleared list produced.
      action: {
        label: 'Show what depends on it',
        onClick: () => {
          setCascadeTargets(pks)
          cascadeDialog.open()
        }
      }
    })
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setIsMutating(true)
    const target = pendingDelete
    try {
      await unwrap(
        window.api.db.deleteRow({
          connectionId,
          schema: details.schema,
          table: details.name,
          pk: pkOf(target)
        })
      )
      await load()
      deleteConfirm.close()
      setPendingDelete(null)
      toast.success('Row deleted')
    } catch (err) {
      deleteConfirm.close()
      reportDeleteFailure(err, [target])
    } finally {
      setIsMutating(false)
    }
  }

  async function handleBulkDelete() {
    if (selectedRows.length === 0) return
    setIsMutating(true)
    const targets = selectedRows
    // allSettled rather than all: the first rejection would otherwise leave the
    // rest in flight, and the count reported would be whatever had landed by
    // then rather than what actually went.
    const outcomes = await Promise.allSettled(
      targets.map((row) =>
        unwrap(
          window.api.db.deleteRow({
            connectionId,
            schema: details.schema,
            table: details.name,
            pk: pkOf(row)
          })
        )
      )
    )
    const failure = outcomes.find((outcome) => outcome.status === 'rejected')
    const deleted = outcomes.filter((outcome) => outcome.status === 'fulfilled').length
    setIsMutating(false)
    setRowSelection({})
    await load()
    bulkDeleteConfirm.close()

    if (!failure) {
      toast.success(`${deleted} row${deleted === 1 ? '' : 's'} deleted`)
      return
    }
    // Cascading is offered for the whole selection, not just the rows that
    // failed: the ones already gone plan to nothing and delete nothing, so
    // narrowing it would only risk dropping a row from the retry.
    reportDeleteFailure(failure.reason, targets, deleted)
  }

  // Hold the whole view behind one full-area loader until the first page is in,
  // so the header/filters/grid all appear at once.
  if (!hasLoadedOnce) {
    if (error) {
      return (
        <div className="p-4">
          <ErrorState
            message={error}
            onRetry={load}
            // A deep link carrying a bad ?filters= fails here, where Retry can
            // only fail again - clearing them is the only way out.
            secondaryAction={
              filters.length > 0
                ? { label: 'Clear filters', onClick: () => setFilters([]) }
                : undefined
            }
          />
        </div>
      )
    }
    return <LoadingState />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SavedViewsMenu
            views={savedViews.views}
            activeView={savedViews.activeView}
            isDirty={savedViews.isDirty}
            isBusy={savedViews.isSaving}
            onApply={applySavedView}
            onSave={(name) => void savedViews.save(name)}
            onOverwrite={(view) => void savedViews.patch(view, { useCurrent: true })}
            onRename={(view, name) => void savedViews.patch(view, { name })}
            onDelete={(view) => void savedViews.remove(view)}
          />
          <FiltersBar
            connectionId={connectionId}
            schema={details.schema}
            table={details.name}
            columns={columns}
            filters={filters}
            onChange={setFilters}
            join={filterJoin}
            onChangeJoin={setFilterJoin}
            onApply={() => {
              setOffset(0)
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={aiPrompt.open}
            aria-label="Filter this table with natural language"
            className="group flex h-7 w-72 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-input px-2.5 text-left transition-colors hover:bg-surface-elevated/40 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
          >
            <span className="flex-1 truncate text-xs text-text-subtle transition-colors group-hover:text-text-muted">
              Describe the rows you want…
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>I</Kbd>
            </span>
          </button>
          <ColumnVisibilityMenu
            columns={columns}
            hiddenColumns={prefs.hiddenColumns}
            frozenColumns={prefs.frozenColumns}
            canFreezeMore={prefs.frozenColumns.length < MAX_FROZEN_COLUMNS}
            onToggle={(column) =>
              persistPrefs({
                hiddenColumns: toggleHiddenColumn(
                  prefs.hiddenColumns,
                  column,
                  columns.map((c) => c.name)
                ),
                // A hidden column cannot stay pinned to the left of a grid it
                // is no longer in.
                frozenColumns: prefs.hiddenColumns.includes(column)
                  ? prefs.frozenColumns
                  : prefs.frozenColumns.filter((c) => c !== column)
              })
            }
            onToggleFrozen={(column) =>
              persistPrefs({ frozenColumns: toggleFrozenColumn(prefs.frozenColumns, column) })
            }
            onShowAll={() => persistPrefs({ hiddenColumns: [] })}
          />
          {details.type === 'table' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={seedDialog.open}
              title="Generate sample rows with AI"
            >
              <IconSeeding size={12} />
              Seed data
            </Button>
          )}
          {canMutate && (
            <Button size="sm" onClick={insertModal.open}>
              Insert row
            </Button>
          )}
          <TableOverflowMenu
            connectionId={connectionId}
            details={details}
            exportRows={selectedRows.length > 0 ? selectedRows : rows}
            exportColumns={columns.map((c) => c.name)}
            onRefresh={load}
            onRenameTable={onRenameTable}
          />
        </div>
      </div>

      {!canMutate && details.type === 'table' && (
        <div className="border-b border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
          This table has no primary key - rows cannot be edited or deleted from the UI.
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataGrid
          columns={visibleColumns}
          rows={rows}
          orderBy={orderBy}
          orderDir={orderDir}
          onSort={handleSort}
          onEditRow={(row) => {
            setEditingRow(row)
            editModal.open()
          }}
          onInspectRow={(row) => {
            setInspectingRow(row)
            recordView.open()
          }}
          onDeleteRow={(row) => {
            setPendingDelete(row)
            deleteConfirm.open()
          }}
          onEditCell={canMutate ? handleEditCell : undefined}
          canMutate={canMutate}
          rowOffset={offset}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          isLoading={isLoading}
          isInitialLoad={isLoading && !hasLoadedOnce}
          fkColumns={fkByColumn}
          onOpenForeignKey={openForeignKey}
          pendingUndoRow={pendingUndoRow}
          insertTarget={{ schema: details.schema, table: details.name, engine }}
          columnSizing={prefs.columnSizing}
          frozenColumns={prefs.frozenColumns}
          onColumnSizingCommit={(columnSizing) => persistPrefs({ columnSizing })}
          onCopied={(format, cellCount) =>
            toast.success(
              `Copied ${cellCount} cell${cellCount === 1 ? '' : 's'} as ${COPY_FORMAT_LABEL[format]}`
            )
          }
          onCopyFailed={(err) => toast.error('Could not copy', { description: errorMessage(err) })}
          hasFilters={filters.length > 0}
          onClearFilters={() => {
            setFilters([])
            setOffset(0)
          }}
        />

        {lastEdit && isUndoPromptVisible && selectedCount === 0 && (
          // Sits where the selection bar sits, and only when that is absent -
          // two stacked floating bars would fight for the same corner.
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
            <div className="animate-slide-up-fade pointer-events-auto flex min-w-0 items-center gap-1 rounded-lg border border-border-strong/70 bg-surface/95 py-1 pl-3 pr-1 text-xs shadow-2xl shadow-black/60 backdrop-blur-xl">
              {/* The change itself, not its coordinates: a truncated key told you
                  where an edit happened but never what it did, which is the only
                  question this control exists to answer. The edited row is
                  highlighted in the grid, which identifies it far better than a
                  fragment of a UUID could. */}
              <span className="flex min-w-0 items-center gap-1.5">
                {/* Not uppercased or letter-spaced like the categorical chips:
                    this is a real identifier, and in Postgres case is load-bearing. */}
                <Chip
                  tone="neutral"
                  className="h-5 max-w-32 truncate rounded-md font-mono text-[11px] font-medium normal-case tracking-normal"
                  title={lastEdit.column}
                >
                  {lastEdit.column}
                </Chip>
                <UndoValue value={lastEdit.previousValue} muted />
                <IconArrowNarrowRight size={12} className="shrink-0 text-text-subtle/60" />
                <UndoValue value={lastEdit.newValue} />
              </span>
              <button
                type="button"
                onClick={() => void undoLastEdit()}
                disabled={isUndoing}
                className="ml-1 flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text focus-visible:bg-surface-elevated focus-visible:text-text focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <IconArrowBackUp size={12} className="shrink-0" />
                {isUndoing ? 'Undoing…' : 'Undo'}
                <Kbd className="ml-0.5">{isMac ? '⌘' : 'Ctrl'}Z</Kbd>
              </button>
            </div>
          </div>
        )}

        {selectedCount > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
            <div className="animate-slide-up-fade pointer-events-auto flex items-center gap-1 rounded-lg border border-border-strong/70 bg-surface/95 py-1.5 pl-2 pr-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
              <span className="flex items-center gap-2 pl-1 pr-1.5 text-xs">
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-surface-elevated px-1.5 font-mono text-xs font-medium text-text ring-1 ring-inset ring-white/10">
                  {selectedCount}
                </span>
                <span className="text-text-subtle">
                  row{selectedCount === 1 ? '' : 's'} selected
                </span>
              </span>

              <span className="mx-1 h-4 w-px bg-white/10" />

              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-md px-2.5 text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={() => setRowSelection({})}
              >
                <IconX size={12} />
                Clear
              </Button>
              <ExportMenu
                rows={selectedRows}
                columns={visibleColumns.map((c) => c.name)}
                filenameParts={[details.schema, details.name]}
                side="top"
                align="center"
                insertTarget={{ schema: details.schema, table: details.name, engine }}
                onCopied={(label) =>
                  toast.success(
                    `Copied ${selectedCount} row${selectedCount === 1 ? '' : 's'} as ${label}`
                  )
                }
                onCopyFailed={(err) =>
                  toast.error('Could not copy', { description: errorMessage(err) })
                }
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 rounded-md px-2.5 text-text-muted hover:bg-surface-elevated hover:text-text"
                >
                  <IconDownload size={12} />
                  Export {selectedCount}
                </Button>
              </ExportMenu>
              {canMutate && (
                <>
                  <span className="mx-1 h-4 w-px bg-white/10" />
                  <Button
                    size="sm"
                    className="h-7 gap-1 rounded-md bg-danger-fill px-3 text-white shadow-[inset_0_-2px_0_0_var(--color-danger-shade),0_1px_3px_0_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/15 hover:bg-danger hover:shadow-none active:shadow-none focus-visible:border-white/60 focus-visible:ring-2 focus-visible:ring-white/30"
                    onClick={bulkDeleteConfirm.open}
                  >
                    <IconTrash size={12} />
                    Delete {selectedCount}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <PaginationBar
        offset={offset}
        pageSize={pageSize}
        loadedCount={rows.length}
        totalEstimate={totalEstimate}
        totalExact={totalExact}
        onChangePage={setOffset}
        onChangePageSize={(size) => {
          setPageSize(size)
          setOffset(0)
          persistPrefs({ pageSize: size })
        }}
      />

      <AiPrompt
        open={aiPrompt.isOpen}
        onOpenChange={(open) => (open ? aiPrompt.open() : aiPrompt.close())}
        onSubmit={handleAiFilter}
        isGenerating={isAiFiltering}
        placeholder={`Filter ${details.name}…`}
        suggestions={aiSuggestions}
      />

      <SeedDataDialog
        open={seedDialog.isOpen}
        onClose={seedDialog.close}
        connectionId={connectionId}
        schema={details.schema}
        table={details.name}
        onApplied={load}
      />

      <RecordViewSheet
        isOpen={recordView.isOpen}
        onClose={recordView.close}
        connectionId={connectionId}
        schema={details.schema}
        table={details.name}
        columns={columns}
        row={inspectingRow}
        foreignKeys={details.foreignKeys}
        onOpenForeignKey={(column, value) => {
          recordView.close()
          openForeignKey(column, value)
        }}
        onEdit={
          canMutate
            ? (row) => {
                recordView.close()
                setEditingRow(row)
                editModal.open()
              }
            : undefined
        }
        onCopied={(label) => toast.success(`Copied the record as ${label}`)}
        onCopyFailed={(err) => toast.error('Could not copy', { description: errorMessage(err) })}
      />

      <RowEditorSheet
        isOpen={insertModal.isOpen}
        onClose={insertModal.close}
        mode="insert"
        columns={columns}
        onSubmit={handleInsert}
      />

      <RowEditorSheet
        isOpen={editModal.isOpen}
        onClose={editModal.close}
        mode="edit"
        columns={columns}
        initialValues={editingRow}
        onSubmit={handleUpdate}
        connectionId={connectionId}
        schema={details.schema}
        table={details.name}
      />

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => {
          deleteConfirm.close()
          setPendingDelete(null)
        }}
        onConfirm={handleDelete}
        title="Delete row?"
        description={`This will permanently delete the row from ${details.schema}.${details.name}.`}
        confirmLabel={isMutating ? 'Deleting…' : 'Delete row'}
        variant="danger"
        isLoading={isMutating}
      />

      <ConfirmDialog
        isOpen={bulkDeleteConfirm.isOpen}
        onClose={bulkDeleteConfirm.close}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedCount} row${selectedCount === 1 ? '' : 's'}?`}
        description={`This will permanently delete ${selectedCount} row${selectedCount === 1 ? '' : 's'} from ${details.schema}.${details.name}.`}
        confirmLabel={isMutating ? 'Deleting…' : `Delete ${selectedCount}`}
        variant="danger"
        isLoading={isMutating}
      />

      <CascadeDeleteDialog
        isOpen={cascadeDialog.isOpen}
        onClose={cascadeDialog.close}
        connectionId={connectionId}
        schema={details.schema}
        table={details.name}
        pks={cascadeTargets}
        onDeleted={(result) => {
          cascadeDialog.close()
          setCascadeTargets([])
          setPendingDelete(null)
          setRowSelection({})
          void load()
          const summary = result.deleted
            .map((entry) => `${entry.table} ${formatNumber(entry.rows)}`)
            .join(' · ')
          toast.success(`${formatNumber(result.totalRows)} rows deleted`, {
            // D1 has no transaction to hold the sequence together, so what the
            // result names is what landed rather than a set that either all
            // went or none did.
            description: result.wasAtomic ? summary : `${summary} · applied one statement at a time`
          })
        }}
      />
    </div>
  )
}

/**
 * One side of an edit, in the same shape the grid uses: NULL named rather than
 * shown as a blank, and anything long clipped with the whole value in the title.
 */
function UndoValue({ value, muted }: { value: unknown; muted?: boolean }) {
  const display = formatCellValue(value)
  const isNull = value === null
  return (
    <span
      title={display}
      className={cn(
        'max-w-28 truncate font-mono text-[11px]',
        isNull && 'italic',
        muted ? 'text-text-subtle' : 'text-text'
      )}
    >
      {display}
    </span>
  )
}

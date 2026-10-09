// @vitest-environment jsdom
import * as React from 'react'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@renderer/components/ui/toast'
import { useTableRows } from '@renderer/features/tables/hooks/use-table-rows'
import { useFilterParams } from '@renderer/features/tables/hooks/use-filter-params'
import type { ColumnInfo, FilterJoin, RowFilter, TableDetails } from '@renderer/types'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const columns: ColumnInfo[] = [
  {
    name: 'id',
    dataType: 'text',
    udtName: 'text',
    isNullable: false,
    isPrimaryKey: true,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  }
]

const details: TableDetails = {
  schema: 'public',
  name: 'activity',
  type: 'table',
  columns,
  primaryKey: ['id'],
  indexes: [],
  foreignKeys: [],
  estimatedRows: 1
}

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

function renderRows(options: {
  offset?: number
  filters?: RowFilter[]
  unfilteredTotal?: number | null
}) {
  const setOffset = vi.fn()
  const hook = renderHook(
    () =>
      useTableRows({
        connectionId: 'c1',
        details,
        filters: options.filters ?? [],
        filterJoin: 'and' as FilterJoin,
        offset: options.offset ?? 0,
        setOffset,
        setFilters: vi.fn(),
        setFiltersState: vi.fn(),
        setFilterJoinState: vi.fn(),
        writeFilterParams: vi.fn(),
        setRowSelection: vi.fn(),
        unfilteredTotal: options.unfilteredTotal
      }),
    { wrapper }
  )
  return { ...hook, setOffset }
}

describe('a page that no longer exists', () => {
  it('steps back a page instead of showing the table as empty', async () => {
    // The last rows of the last page were deleted, and the reload came back
    // with nothing at that offset.
    Object.assign(window, {
      api: {
        db: { getRows: () => ok({ rows: [], columns, totalEstimate: 0 }), countRows: () => ok(0) }
      }
    })
    const { setOffset, result } = renderRows({ offset: 100 })

    await waitFor(() => expect(setOffset).toHaveBeenCalledWith(50))
    expect(result.current.isLoading, 'still loading the page it stepped back to').toBe(true)
  })

  it('shows an empty first page as empty', async () => {
    Object.assign(window, {
      api: {
        db: { getRows: () => ok({ rows: [], columns, totalEstimate: 0 }), countRows: () => ok(0) }
      }
    })
    const { setOffset, result } = renderRows({ offset: 0 })

    await waitFor(() => expect(result.current.hasLoadedOnce).toBe(true))
    expect(setOffset).not.toHaveBeenCalled()
  })
})

describe('the row count', () => {
  it('borrows the container count while nothing is filtered, rather than counting twice', async () => {
    const countRows = vi.fn(() => ok(99))
    Object.assign(window, {
      api: {
        db: { getRows: () => ok({ rows: [{ id: 'a' }], columns, totalEstimate: 1 }), countRows }
      }
    })
    const { result } = renderRows({ unfilteredTotal: 7 })

    await waitFor(() => expect(result.current.hasLoadedOnce).toBe(true))
    expect(result.current.totalExact).toBe(7)
    expect(countRows).not.toHaveBeenCalled()
  })

  it('counts for itself once a filter narrows the rows', async () => {
    const countRows = vi.fn(() => ok(3))
    Object.assign(window, {
      api: {
        db: { getRows: () => ok({ rows: [{ id: 'a' }], columns, totalEstimate: 1 }), countRows }
      }
    })
    const { result } = renderRows({
      unfilteredTotal: 7,
      filters: [{ column: 'id', operator: '=', value: 'a' }]
    })

    await waitFor(() => expect(result.current.totalExact).toBe(3))
    expect(countRows).toHaveBeenCalledTimes(1)
  })

  it('counts for itself when no container count is offered', async () => {
    const countRows = vi.fn(() => ok(5))
    Object.assign(window, {
      api: {
        db: { getRows: () => ok({ rows: [{ id: 'a' }], columns, totalEstimate: 1 }), countRows }
      }
    })
    const { result } = renderRows({})

    await waitFor(() => expect(result.current.totalExact).toBe(5))
  })
})

describe('a filter write that arrives after the view has gone', () => {
  it('does not navigate back to the table it belonged to', async () => {
    let write: ((filters: RowFilter[], join: FilterJoin) => void) | null = null

    function Consumer() {
      const { writeFilterParams } = useFilterParams({ onAdopt: () => {} })
      write = writeFilterParams
      return null
    }
    function Location() {
      const location = useLocation()
      return <span data-testid="location">{location.pathname + location.search}</span>
    }
    function Leave() {
      const navigate = useNavigate()
      return <button onClick={() => navigate('/other?table=orders')}>leave</button>
    }

    render(
      <MemoryRouter initialEntries={['/db?table=activity']}>
        <Routes>
          <Route path="/db" element={<Consumer />} />
          <Route path="/other" element={null} />
        </Routes>
        <Location />
        <Leave />
      </MemoryRouter>
    )
    act(() => screen.getByText('leave').click())
    expect(screen.getByTestId('location').textContent).toBe('/other?table=orders')

    // A late AI filter, or an "Undo filters" toast clicked after leaving.
    act(() => write?.([{ column: 'id', operator: '=', value: 'x' }], 'and'))

    expect(screen.getByTestId('location').textContent).toBe('/other?table=orders')
  })
})

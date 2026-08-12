// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TableDataView } from '@renderer/features/tables/components/table-data-view'
import { ToastProvider } from '@renderer/components/ui/toast'
import { loadViewPrefs } from '@renderer/features/tables/lib/view-prefs'
import { tableRouteWithFilters } from '@renderer/features/tables/lib/filter-params'
import type { ColumnInfo, TableDetails } from '@renderer/types'

function column(name: string): ColumnInfo {
  return {
    name,
    dataType: 'text',
    udtName: 'text',
    isNullable: true,
    isPrimaryKey: name === 'id',
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  }
}

const columns = [column('id'), column('name'), column('secret')]

const details: TableDetails = {
  schema: 'public',
  name: 'users',
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

const getRows = vi.fn()

beforeEach(() => {
  localStorage.clear()
  getRows
    .mockReset()
    .mockImplementation(() => ok({ rows: [{ id: '1', name: 'Ada', secret: 'x' }], columns }))
  Object.assign(window, { api: { db: { getRows, countRows: () => ok(1) } } })
})

afterEach(cleanup)

function mount(url = '/database/table?schema=public&table=users') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <TableDataView connectionId="c1" details={details} />
      </ToastProvider>
    </MemoryRouter>
  )
}

function lastGetRowsCall(): Record<string, unknown> {
  return getRows.mock.calls[getRows.mock.calls.length - 1][0]
}

/**
 * Column names in the grid header. Read off the DOM rather than by role: the
 * open dropdown marks the rest of the page inert, and it lists the same names.
 */
function hasGridColumn(name: string): boolean {
  return [...document.querySelectorAll('table thead th')].some((th) =>
    th.textContent?.includes(name)
  )
}

/** Radix opens on pointerdown, which fireEvent.click does not imply. */
function open(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  fireEvent.click(trigger)
}

async function openColumnsMenu() {
  open(screen.getByTitle('Show or hide columns'))
  await screen.findByLabelText('Search columns')
}

/** The row button for a column inside the open Columns popover. */
function columnRow(name: string): HTMLElement {
  const menu = screen.getByLabelText('Search columns').closest('div[class*="flex-col"]')
  const match = [...(menu?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent?.startsWith(name) && button.title.includes('this column')
  )
  if (!match) throw new Error(`No row for ${name}`)
  return match
}

describe('a filtered deep link', () => {
  it('loads the rows it asked for', async () => {
    // An FK jump is exactly this. The mount-time reset used to clear the
    // filters straight back out, landing you on the unfiltered table.
    const filters = JSON.stringify([{ column: 'name', operator: '=', value: 'Ada' }])
    mount(`/database/table?schema=public&table=users&filters=${encodeURIComponent(filters)}`)

    await waitFor(() => expect(getRows).toHaveBeenCalled())
    expect(lastGetRowsCall().filters).toEqual([{ column: 'name', operator: '=', value: 'Ada' }])
  })

  it('keeps a single-column fk link working too', async () => {
    mount('/database/table?schema=public&table=users&fkColumn=id&fkValue=7')

    await waitFor(() => expect(getRows).toHaveBeenCalled())
    expect(lastGetRowsCall().filters).toEqual([{ column: 'id', operator: '=', value: '7' }])
  })
})

describe('the saved view', () => {
  it('restores the sort on the next visit', async () => {
    mount()
    await screen.findByText('Ada')

    fireEvent.click(screen.getByLabelText('Sort by name'))
    await waitFor(() => expect(loadViewPrefs('c1', 'public', 'users').orderBy).toBe('name'))

    cleanup()
    getRows.mockClear()
    mount()

    await waitFor(() => expect(getRows).toHaveBeenCalled())
    expect(lastGetRowsCall().orderBy).toBe('name')
    expect(lastGetRowsCall().orderDir).toBe('asc')
  })

  it('remembers a sort cleared back to none', async () => {
    mount()
    await screen.findByText('Ada')

    fireEvent.click(screen.getByLabelText('Sort by name')) // asc
    fireEvent.click(screen.getByLabelText('Sort name descending')) // desc
    fireEvent.click(screen.getByLabelText('Clear sort on name')) // off

    await waitFor(() => expect(loadViewPrefs('c1', 'public', 'users').orderBy).toBeNull())
  })

  it('restores the page size', async () => {
    mount()
    await screen.findByText('Ada')

    open(screen.getByLabelText('Rows per page'))
    fireEvent.click(await screen.findByText('100'))
    await waitFor(() => expect(loadViewPrefs('c1', 'public', 'users').pageSize).toBe(100))

    cleanup()
    getRows.mockClear()
    mount()

    await waitFor(() => expect(getRows).toHaveBeenCalled())
    expect(lastGetRowsCall().limit).toBe(100)
  })
})

describe('hiding a column', () => {
  it('takes it out of the grid and remembers it', async () => {
    mount()
    await screen.findByText('Ada')
    expect(hasGridColumn('secret')).toBe(true)

    await openColumnsMenu()
    fireEvent.click(columnRow('secret'))

    await waitFor(() => expect(hasGridColumn('secret')).toBe(false))
    expect(loadViewPrefs('c1', 'public', 'users').hiddenColumns).toEqual(['secret'])
  })

  it('still fetches the hidden column, so showing it again needs no reload', async () => {
    mount()
    await screen.findByText('Ada')

    await openColumnsMenu()
    fireEvent.click(columnRow('secret'))
    await waitFor(() => expect(hasGridColumn('secret')).toBe(false))

    // Hiding is a view concern; narrowing the SELECT would make it a query one.
    expect(lastGetRowsCall()).not.toHaveProperty('columns')
  })
})

describe('pinning a column', () => {
  it('pins without also hiding it', async () => {
    // The pin used to sit inside a dropdown menu item, whose own activation
    // fired alongside the pin's - so pinning hid the column.
    mount()
    await screen.findByText('Ada')
    await openColumnsMenu()

    fireEvent.click(screen.getByLabelText('Pin name to the left'))

    await waitFor(() =>
      expect(loadViewPrefs('c1', 'public', 'users').frozenColumns).toEqual(['name'])
    )
    expect(loadViewPrefs('c1', 'public', 'users').hiddenColumns).toEqual([])
    expect(hasGridColumn('name')).toBe(true)
  })

  it('unpins on a second click', async () => {
    mount()
    await screen.findByText('Ada')
    await openColumnsMenu()

    fireEvent.click(screen.getByLabelText('Pin name to the left'))
    await waitFor(() => expect(screen.getByLabelText('Unpin name')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Unpin name'))

    await waitFor(() => expect(loadViewPrefs('c1', 'public', 'users').frozenColumns).toEqual([]))
  })

  it('unpins a column when it is hidden', async () => {
    // A hidden column cannot stay pinned to the left of a grid it is not in.
    mount()
    await screen.findByText('Ada')
    await openColumnsMenu()

    fireEvent.click(screen.getByLabelText('Pin secret to the left'))
    await waitFor(() =>
      expect(loadViewPrefs('c1', 'public', 'users').frozenColumns).toEqual(['secret'])
    )
    fireEvent.click(columnRow('secret'))

    await waitFor(() => expect(loadViewPrefs('c1', 'public', 'users').frozenColumns).toEqual([]))
  })
})

/** Navigates without unmounting the view, the way an in-app link does. */
function Jump({ to }: { to: string }) {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(to)}>
      jump
    </button>
  )
}

describe('filters arriving in the URL while the table is already open', () => {
  it('adopts them instead of ignoring the navigation', async () => {
    // The container keys this component by schema.table, so landing on the
    // table you are already looking at never remounts it - and the lazy
    // initialiser that seeds `filters` from the URL runs only on mount. A
    // value-search hit on the open table silently did nothing.
    render(
      <MemoryRouter initialEntries={['/database/table?schema=public&table=users']}>
        <ToastProvider>
          <Jump
            to={tableRouteWithFilters('public', 'users', [
              { column: 'name', operator: 'ilike', value: '%Ada%' }
            ])}
          />
          <TableDataView connectionId="c1" details={details} />
        </ToastProvider>
      </MemoryRouter>
    )
    await waitFor(() => expect(getRows).toHaveBeenCalled())

    fireEvent.click(screen.getByText('jump'))

    await waitFor(() =>
      expect(lastGetRowsCall().filters).toEqual([
        { column: 'name', operator: 'ilike', value: '%Ada%' }
      ])
    )
  })

  it('goes back to the first page, since the match is not at the old offset', async () => {
    render(
      <MemoryRouter initialEntries={['/database/table?schema=public&table=users']}>
        <ToastProvider>
          <Jump
            to={tableRouteWithFilters('public', 'users', [
              { column: 'name', operator: '=', value: 'Ada' }
            ])}
          />
          <TableDataView connectionId="c1" details={details} />
        </ToastProvider>
      </MemoryRouter>
    )
    await waitFor(() => expect(getRows).toHaveBeenCalled())

    fireEvent.click(screen.getByText('jump'))

    await waitFor(() => expect(lastGetRowsCall().offset).toBe(0))
  })

  it('leaves a filter the view itself wrote alone', async () => {
    // The component writes these params as well as reading them. Treating its
    // own write as an incoming change would revert every edit made in the
    // filter bar. Asserted on the filters rather than on a call count, because
    // the page prefetcher issues its own getRows and would make counting flaky.
    mount(
      tableRouteWithFilters('public', 'users', [{ column: 'name', operator: '=', value: 'Ada' }])
    )

    await waitFor(() =>
      expect(lastGetRowsCall().filters).toEqual([{ column: 'name', operator: '=', value: 'Ada' }])
    )
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(lastGetRowsCall().filters, 'not reverted by its own URL write').toEqual([
      { column: 'name', operator: '=', value: 'Ada' }
    ])
  })

  it('adopts a join that changed even when the filters did not', async () => {
    // Comparing only the filters param missed this: the same two filters
    // rejoined with OR is a different query.
    const twoFilters = [
      { column: 'name', operator: '=' as const, value: 'Ada' },
      { column: 'secret', operator: '=' as const, value: 'x' }
    ]
    render(
      <MemoryRouter initialEntries={[tableRouteWithFilters('public', 'users', twoFilters)]}>
        <ToastProvider>
          <Jump to={`${tableRouteWithFilters('public', 'users', twoFilters)}&join=or`} />
          <TableDataView connectionId="c1" details={details} />
        </ToastProvider>
      </MemoryRouter>
    )
    await waitFor(() => expect(getRows).toHaveBeenCalled())

    fireEvent.click(screen.getByText('jump'))

    await waitFor(() => expect(lastGetRowsCall().filterJoin).toBe('or'))
  })
})

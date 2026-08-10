// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TableDataView } from '@renderer/features/tables/components/table-data-view'
import { ToastProvider } from '@renderer/components/ui/toast'
import type { ColumnInfo, TableDetails } from '@renderer/types'

afterEach(cleanup)

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

function mount() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <TableDataView connectionId="c1" details={details} />
      </ToastProvider>
    </MemoryRouter>
  )
}

describe('a reload that fails', () => {
  it('is reported in a toast with a way to try again', async () => {
    // Rows load, then the connection drops. The grid is already on screen, so
    // the failure has to arrive without shoving it down the page.
    let hasDropped = false
    const getRows = vi.fn(() =>
      hasDropped
        ? Promise.resolve({ success: false, error: 'connection terminated' })
        : ok({ rows: [{ id: 'a1' }], columns, totalEstimate: 1 })
    )
    Object.assign(window, { api: { db: { getRows, countRows: () => ok(1) } } })
    mount()
    await screen.findByText('a1')

    hasDropped = true
    fireEvent.click(screen.getByLabelText(/sort/i)) // sorting reloads

    expect(await screen.findByText('Could not load rows')).toBeTruthy()
    expect(await screen.findByText(/connection terminated/)).toBeTruthy()
    expect(screen.getByText('a1'), 'the rows already fetched stay put').toBeTruthy()

    // The filters are not what changed, so reverting them would fix nothing.
    expect(screen.queryByText('Undo filters')).toBeNull()

    const before = getRows.mock.calls.length
    fireEvent.click(screen.getByText('Refresh'))
    await waitFor(() => expect(getRows.mock.calls.length).toBeGreaterThan(before))
  })

  it('offers to undo the filter that broke it', async () => {
    // An AI filter can name a value the column will not accept. Refresh would
    // only re-run the same failing query, and the filter is in the URL too.
    const getRows = vi.fn((opts: { filters?: unknown[] }) =>
      opts.filters?.length
        ? Promise.resolve({
            success: false,
            error: 'invalid input value for enum audit_action: "update"'
          })
        : ok({ rows: [{ id: 'a1' }], columns, totalEstimate: 1 })
    )
    const filterTable = vi.fn(() =>
      ok({ filters: [{ column: 'id', operator: '=', value: 'update' }] })
    )
    Object.assign(window, {
      api: { db: { getRows, countRows: () => ok(1) }, ai: { filterTable } }
    })
    mount()
    await screen.findByText('a1')

    fireEvent.click(screen.getByLabelText(/natural language/i))
    const input = await screen.findByPlaceholderText(/filter activity/i)
    fireEvent.change(input, { target: { value: 'rows where action is update' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText(/invalid input value for enum/)).toBeTruthy()
    expect(screen.getByText('Undo filters')).toBeTruthy()
    expect(screen.queryByText('Refresh')).toBeNull()

    fireEvent.click(screen.getByText('Undo filters'))
    await waitFor(() => {
      const last = getRows.mock.calls.at(-1)?.[0]
      expect(last?.filters, 'reverted to the filters that last loaded').toEqual([])
    })
  })

  it('shows the full-area error instead when no rows ever arrived', async () => {
    // Nothing is on screen to preserve, and a toast that fades would leave an
    // empty view with no explanation.
    Object.assign(window, {
      api: {
        db: {
          getRows: () =>
            Promise.resolve({ success: false, error: 'password authentication failed' }),
          countRows: () => ok(0)
        }
      }
    })
    mount()

    expect(await screen.findByText(/password authentication failed/)).toBeTruthy()
    expect(screen.queryByText('Could not load rows')).toBeNull()
  })
})

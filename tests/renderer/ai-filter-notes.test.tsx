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
  name: 'audit_logs',
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

function mount(filterTable: () => Promise<unknown>) {
  const getRows = vi.fn(() => ok({ rows: [{ id: 'a1' }], columns, totalEstimate: 1 }))
  Object.assign(window, {
    api: { db: { getRows, countRows: () => ok(1) }, ai: { filterTable } }
  })
  render(
    <MemoryRouter>
      <ToastProvider>
        <TableDataView connectionId="c1" details={details} />
      </ToastProvider>
    </MemoryRouter>
  )
  return getRows
}

async function ask() {
  fireEvent.click(await screen.findByLabelText(/natural language/i))
  // The prompt lives in a Radix portal, so it mounts a tick after the click.
  const input = await screen.findByPlaceholderText(/filter audit_logs/i)
  fireEvent.change(input, { target: { value: 'rows where action is banana' } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('when the AI filter drops conditions it could not make executable', () => {
  it('applies nothing and explains, rather than showing the whole table', async () => {
    // An empty filter set would widen the view to every row and read as an
    // answer to a question that was never actually asked.
    const getRows = mount(() =>
      ok({
        filters: [],
        notes: ['No value of "action" matches "banana" - that condition was dropped.']
      })
    )
    await screen.findByText('a1')
    const before = getRows.mock.calls.length

    await ask()

    expect(await screen.findByText('Could not build that filter')).toBeTruthy()
    expect(screen.getByText(/matches "banana"/)).toBeTruthy()
    expect(getRows.mock.calls.length, 'no reload for a filter that was never applied').toBe(before)
    // The prompt stays open so the request can be rephrased.
    expect(screen.getByPlaceholderText(/filter audit_logs/i)).toBeTruthy()
  })

  it('applies the conditions that survived and still says what went', async () => {
    const getRows = mount(() =>
      ok({
        filters: [{ column: 'id', operator: '=', value: 'a1' }],
        notes: ['No value of "action" matches "banana" - that condition was dropped.']
      })
    )
    await screen.findByText('a1')
    const before = getRows.mock.calls.length

    await ask()

    expect(await screen.findByText('Some conditions were dropped')).toBeTruthy()
    await waitFor(() => {
      const last = getRows.mock.calls.at(-1)?.[0] as { filters?: unknown[] } | undefined
      expect(last?.filters).toEqual([{ column: 'id', operator: '=', value: 'a1' }])
    })
    expect(getRows.mock.calls.length).toBeGreaterThan(before)
  })
})

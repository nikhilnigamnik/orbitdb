// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TableDataView } from '@renderer/features/tables/components/table-data-view'
import { UNDO_PROMPT_MS } from '@renderer/config/site'
import { ToastProvider } from '@renderer/components/ui/toast'
import type { ColumnInfo, TableDetails } from '@renderer/types'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function column(name: string, isPrimaryKey = false): ColumnInfo {
  return {
    name,
    dataType: 'text',
    udtName: 'text',
    isNullable: true,
    isPrimaryKey,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  }
}

const columns = [column('id', true), column('related_type')]
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

const rows = [{ id: 'a1', related_type: 'Lead' }]

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

beforeEach(() => {
  Object.assign(window, {
    api: {
      db: {
        getRows: () => ok({ rows, columns, totalEstimate: 1 }),
        countRows: () => ok(1),
        updateRow: () => ok({ id: 'a1', related_type: 'Customer' })
      }
    }
  })
})

/** Double-click the cell, type a new value, commit it. */
async function editRelatedType() {
  const cell = await screen.findByText('Lead')
  fireEvent.doubleClick(cell)
  const input = await screen.findByDisplayValue('Lead')
  fireEvent.change(input, { target: { value: 'Customer' } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

function markedRow(): Element | null {
  return document.querySelector('tr.outline-accent\\/40, tr[class*="outline-accent"]')
}

describe('after a cell edit', () => {
  it('offers the undo, and marks the row it belongs to', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <TableDataView connectionId="c1" details={details} />
        </ToastProvider>
      </MemoryRouter>
    )
    await editRelatedType()

    expect(await screen.findByText('Undo')).toBeTruthy()
    await waitFor(() => expect(markedRow()).not.toBeNull())
  })

  it('drops the row marker with the prompt, not long after it', async () => {
    // The marker points at the prompt. Bound to the edit instead, it outlived the
    // bar and left the row highlighted for as long as the table stayed open.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(
      <MemoryRouter>
        <ToastProvider>
          <TableDataView connectionId="c1" details={details} />
        </ToastProvider>
      </MemoryRouter>
    )
    await editRelatedType()
    await screen.findByText('Undo')

    await act(async () => {
      vi.advanceTimersByTime(UNDO_PROMPT_MS - 500)
    })
    expect(markedRow(), 'still marked while the prompt is up').not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.queryByText('Undo'), 'the prompt should have faded').toBeNull()
    expect(markedRow(), 'and the row marker with it').toBeNull()
  })
})

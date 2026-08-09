// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FiltersBar } from '@renderer/features/tables/components/filters-bar'
import type { ColumnInfo, RowFilter } from '@renderer/types'

const columns: ColumnInfo[] = [
  {
    name: 'status',
    dataType: 'text',
    udtName: 'text',
    isNullable: true,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  },
  {
    name: 'name',
    dataType: 'text',
    udtName: 'text',
    isNullable: false,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 2,
    characterMaximumLength: null,
    enumValues: null
  }
]

const columnDistinct = vi.fn()

beforeEach(() => {
  columnDistinct.mockReset()
  columnDistinct.mockResolvedValue({ success: true, data: ['active', null] })
  vi.stubGlobal('window', window)
  Object.assign(window, { api: { db: { columnDistinct } } })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(filters: RowFilter[] = []) {
  const onChange = vi.fn()
  const onApply = vi.fn()
  render(
    <FiltersBar
      connectionId="c"
      schema="public"
      table="users"
      columns={columns}
      filters={filters}
      onChange={onChange}
      onApply={onApply}
    />
  )
  return { onChange, onApply }
}

/** Open the picker and drill into a column, which is where the editor lives. */
async function openEditorOn(columnName: string) {
  fireEvent.click(screen.getByLabelText(/Open filters|Add filter/))
  fireEvent.click(await screen.findByText(columnName))
}

describe('picking a NULL suggestion', () => {
  it('applies a null test rather than an empty-string comparison', async () => {
    const { onChange } = setup()
    await openEditorOn('status')

    fireEvent.click(await screen.findByText('NULL'))

    expect(onChange).toHaveBeenCalledWith([{ column: 'status', operator: 'is null', value: '' }])
  })
})

describe('the value box', () => {
  it('searches the column’s distinct values, debounced', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    await openEditorOn('status')

    await waitFor(() => expect(columnDistinct).toHaveBeenCalled())
    columnDistinct.mockClear()

    const box = screen.getByPlaceholderText('Enter value…')
    fireEvent.change(box, { target: { value: 'a' } })
    fireEvent.change(box, { target: { value: 'ac' } })
    fireEvent.change(box, { target: { value: 'act' } })

    // Held back: three keystrokes must not be three queries.
    expect(columnDistinct).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)
    await waitFor(() => expect(columnDistinct).toHaveBeenCalledTimes(1))
    expect(columnDistinct).toHaveBeenCalledWith(expect.objectContaining({ search: 'act' }))
  })

  it('asks for more than a handful of suggestions', async () => {
    setup()
    await openEditorOn('status')

    await waitFor(() => expect(columnDistinct).toHaveBeenCalled())
    const { limit } = columnDistinct.mock.calls[0][0]
    expect(limit).toBeGreaterThan(5)
  })
})

describe('the suggestions heading', () => {
  it('sits at the smaller chip size, not body size', async () => {
    setup()
    await openEditorOn('status')

    const heading = await screen.findByText('Suggestions')
    expect(heading.className).toContain('text-[10px]')
    expect(heading.className).not.toMatch(/\btext-xs\b/)
  })
})

describe('pattern operators', () => {
  it('says what % does, and only for like and ilike', async () => {
    setup()
    await openEditorOn('name')

    expect(screen.queryByText(/matches any run of characters/)).toBeNull()

    fireEvent.click(screen.getByText('like'))
    expect(await screen.findByText(/matches any run of characters/)).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. %term%')).toBeTruthy()
  })
})

describe('editing an applied filter', () => {
  it('reopens it loaded, and replaces it instead of appending', async () => {
    const { onChange } = setup([
      { column: 'status', operator: '=', value: 'active' },
      { column: 'name', operator: 'like', value: '%bo%' }
    ])

    fireEvent.click(screen.getByLabelText('Edit filter on status'))

    // Loaded with what was applied, not reset to a blank editor.
    const box = await screen.findByDisplayValue('active')
    fireEvent.change(box, { target: { value: 'archived' } })
    fireEvent.click(screen.getByText('Update'))

    expect(onChange).toHaveBeenCalledWith([
      { column: 'status', operator: '=', value: 'archived' },
      { column: 'name', operator: 'like', value: '%bo%' }
    ])
  })
})

describe('clear all', () => {
  it('drops every filter in one go', () => {
    const { onChange, onApply } = setup([
      { column: 'status', operator: '=', value: 'active' },
      { column: 'name', operator: 'like', value: '%bo%' }
    ])

    fireEvent.click(screen.getByLabelText('Clear all filters'))

    expect(onChange).toHaveBeenCalledWith([])
    expect(onApply).toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataGrid } from '@renderer/features/tables/components/data-grid'
import type { ColumnInfo } from '@renderer/types'

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

const COLUMNS = [column('id'), column('name'), column('city')]
const ROWS = [
  { id: '1', name: 'Ada', city: 'London' },
  { id: '2', name: 'Grace', city: 'New York' }
]

const writeText = vi.fn()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
})

afterEach(cleanup)

function mount(props: Partial<React.ComponentProps<typeof DataGrid>> = {}) {
  const onCopied = vi.fn()
  render(
    <DataGrid
      columns={COLUMNS}
      rows={ROWS}
      orderBy={null}
      orderDir="asc"
      onSort={vi.fn()}
      onEditRow={vi.fn()}
      onDeleteRow={vi.fn()}
      canMutate={false}
      insertTarget={{ schema: 'public', table: 'users', engine: 'postgres' }}
      onCopied={onCopied}
      {...props}
    />
  )
  return { grid: screen.getByRole('grid'), onCopied }
}

/** The td for a cell, found by its rendered text. Body only - a header th is not a cell. */
function cell(text: string): HTMLElement {
  const match = screen
    .getAllByText(text)
    .map((node) => node.closest('td'))
    .find((td): td is HTMLTableCellElement => td != null)
  if (!match) throw new Error(`No body cell rendering ${text}`)
  return match
}

/** Addressed positionally, for values that appear more than once on screen. */
function cellAt(rowIndex: number, columnName: string): HTMLElement {
  const body = screen.getByRole('grid').querySelector('tbody')
  const row = body!.querySelectorAll('tr')[rowIndex]
  // Two leading display columns: the checkbox and the row number.
  const offset = 2 + COLUMNS.findIndex((c) => c.name === columnName)
  return row.querySelectorAll('td')[offset] as HTMLElement
}

describe('placing the cursor', () => {
  it('lands on the cell that was clicked', () => {
    mount()
    fireEvent.mouseDown(cell('Ada'))

    expect(cell('Ada').getAttribute('aria-selected')).toBe('true')
  })

  it('starts at the first cell when an arrow key arrives with no cursor', () => {
    const { grid } = mount()
    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    expect(cellAt(0, 'id').getAttribute('aria-selected')).toBe('true')
  })

  it('moves with the arrow keys and stops at the edge', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cell('Ada'))

    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    expect(cell('Grace').getAttribute('aria-selected')).toBe('true')

    // Already on the last row - staying put beats wrapping to the top.
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    expect(cell('Grace').getAttribute('aria-selected')).toBe('true')
  })

  it('clears on Escape', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'Escape' })

    expect(cell('Ada').getAttribute('aria-selected')).toBeNull()
  })
})

describe('copying', () => {
  it('copies one cell with no header', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'c', metaKey: true })

    expect(writeText).toHaveBeenCalledWith('Ada')
  })

  it('copies a shift-extended block as TSV with a header', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(grid, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(grid, { key: 'c', metaKey: true })

    expect(writeText).toHaveBeenCalledWith('name\tcity\nAda\tLondon\nGrace\tNew York')
  })

  it('copies as JSON with shift held', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'c', metaKey: true, shiftKey: true })

    expect(writeText).toHaveBeenCalledWith('"Ada"')
  })

  it('reports what was copied', async () => {
    const { grid, onCopied } = mount()
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(grid, { key: 'c', metaKey: true })

    await waitFor(() => expect(onCopied).toHaveBeenCalledWith('tsv', 2))
  })

  it('does nothing with no cursor', () => {
    const { grid } = mount()
    fireEvent.keyDown(grid, { key: 'c', metaKey: true })

    expect(writeText).not.toHaveBeenCalled()
  })

  it('surfaces a clipboard the browser refused', async () => {
    const onCopyFailed = vi.fn()
    writeText.mockRejectedValue(new Error('denied'))
    const { grid } = mount({ onCopyFailed })
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'c', metaKey: true })

    await waitFor(() => expect(onCopyFailed).toHaveBeenCalled())
  })
})

describe('the range', () => {
  it('shrinks back when shift moves the cursor toward the anchor', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cellAt(0, 'id'))
    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(grid, { key: 'ArrowLeft', shiftKey: true })
    fireEvent.keyDown(grid, { key: 'c', metaKey: true })

    expect(writeText).toHaveBeenCalledWith('id\tname\n1\tAda')
  })

  it('collapses when an arrow arrives without shift', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    fireEvent.keyDown(grid, { key: 'c', metaKey: true })

    expect(writeText).toHaveBeenCalledWith('Ada')
  })

  it('extends to a shift-clicked cell', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.mouseDown(cell('New York'), { shiftKey: true })
    fireEvent.keyDown(grid, { key: 'c', metaKey: true })

    expect(writeText).toHaveBeenCalledWith('name\tcity\nAda\tLondon\nGrace\tNew York')
  })
})

describe('Enter', () => {
  it('opens the editor on the cursor cell when the table can be edited', () => {
    const { grid } = mount({ canMutate: true, onEditCell: vi.fn() })
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'Enter' })

    expect(screen.getByDisplayValue('Ada')).toBeTruthy()
  })

  it('does nothing on a view, which has no editor to open', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'Enter' })

    expect(screen.queryByDisplayValue('Ada')).toBeNull()
  })
})

describe('row keys on the cursor row', () => {
  it('toggles the row selection on Space', () => {
    const onRowSelectionChange = vi.fn()
    const { grid } = mount({ rowSelection: {}, onRowSelectionChange })
    fireEvent.mouseDown(cell('Grace'))
    fireEvent.keyDown(grid, { key: ' ' })

    expect(onRowSelectionChange).toHaveBeenCalledWith({ 1: true })
  })

  it('opens the record on Shift+Enter, without starting an edit', () => {
    const onInspectRow = vi.fn()
    const { grid } = mount({ canMutate: true, onEditCell: vi.fn(), onInspectRow })
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(grid, { key: 'Enter', shiftKey: true })

    expect(onInspectRow).toHaveBeenCalledWith(ROWS[0])
    expect(screen.queryByDisplayValue('Ada')).toBeNull()
  })

  it.each(['Delete', 'Backspace'])('asks to delete the row on %s', (key) => {
    // onDeleteRow opens the confirm in the table view; the key never deletes.
    const onDeleteRow = vi.fn()
    const { grid } = mount({ canMutate: true, onDeleteRow })
    fireEvent.mouseDown(cell('Grace'))
    fireEvent.keyDown(grid, { key })

    expect(onDeleteRow).toHaveBeenCalledWith(ROWS[1])
  })

  it('does not offer delete on a table that cannot be edited', () => {
    const onDeleteRow = vi.fn()
    const { grid } = mount({ onDeleteRow })
    fireEvent.mouseDown(cell('Grace'))
    fireEvent.keyDown(grid, { key: 'Delete' })

    expect(onDeleteRow).not.toHaveBeenCalled()
  })

  it('leaves Space to a focused checkbox inside the grid', () => {
    const onRowSelectionChange = vi.fn()
    mount({ rowSelection: {}, onRowSelectionChange })
    fireEvent.mouseDown(cell('Ada'))
    fireEvent.keyDown(screen.getByLabelText('Select row 1'), { key: ' ' })

    expect(onRowSelectionChange).not.toHaveBeenCalled()
  })
})

describe('tab stops', () => {
  it('keeps row controls out of the tab order until the cursor is on their row', () => {
    mount({ canMutate: true, onInspectRow: vi.fn() })
    const tabbable = (label: string) =>
      screen.getAllByLabelText(label).map((node) => node.getAttribute('tabindex'))

    expect(tabbable('Edit row')).toEqual(['-1', '-1'])

    fireEvent.mouseDown(cell('Grace'))
    expect(tabbable('Edit row')).toEqual(['-1', '0'])
    expect(screen.getByLabelText('Select row 2').getAttribute('tabindex')).toBe('0')
    expect(screen.getByLabelText('Select row 1').getAttribute('tabindex')).toBe('-1')
  })
})

describe('grid semantics', () => {
  it('puts the grid role on the table, with grid cells and column headers', () => {
    const { grid } = mount()
    expect(grid.tagName).toBe('TABLE')
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0)
    expect(cell('Ada').getAttribute('role')).toBe('gridcell')
  })

  it('points the active descendant at the cursor cell', () => {
    const { grid } = mount()
    fireEvent.mouseDown(cell('Ada'))
    expect(grid.getAttribute('aria-activedescendant')).toBe(cell('Ada').id)
  })

  it('reports aria-sort on the sorted header cell itself', () => {
    mount({ orderBy: 'name', orderDir: 'desc' })
    const th = screen.getByText('name').closest('th')!
    expect(th.getAttribute('aria-sort')).toBe('descending')
    expect(screen.getByText('city').closest('th')!.getAttribute('aria-sort')).toBe('none')
  })

  it('says it is busy while a page loads', () => {
    const { grid } = mount({ isLoading: true })
    expect(grid.getAttribute('aria-busy')).toBe('true')
  })

  it('counts every matching row, not just the page, when the total is known', () => {
    const { grid } = mount({ totalRows: 120, rowOffset: 50 })
    expect(grid.getAttribute('aria-rowcount')).toBe('121')
    expect(cell('Ada').closest('tr')!.getAttribute('aria-rowindex')).toBe('52')
  })
})

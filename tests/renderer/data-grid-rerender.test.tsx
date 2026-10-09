// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@renderer/components/ui/toast'
import { DataGrid } from '@renderer/features/tables/components/data-grid'
import { TableDataView } from '@renderer/features/tables/components/table-data-view'
import type { ColumnInfo, TableDetails } from '@renderer/types'

// Counts how often cells are formatted, which is once per cell render.
const formatted = vi.hoisted(() => ({ count: 0 }))
vi.mock('@renderer/lib/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/lib/format')>()
  return {
    ...actual,
    formatCellValue: (...args: Parameters<typeof actual.formatCellValue>) => {
      formatted.count += 1
      return actual.formatCellValue(...args)
    }
  }
})

afterEach(cleanup)

const COLUMNS: ColumnInfo[] = ['id', 'name'].map((name, index) => ({
  name,
  dataType: 'text',
  udtName: 'text',
  isNullable: true,
  isPrimaryKey: name === 'id',
  defaultValue: null,
  ordinalPosition: index + 1,
  characterMaximumLength: null,
  enumValues: null
}))
const ROWS = Array.from({ length: 50 }, (_, i) => ({ id: String(i), name: `row ${i}` }))

describe('re-rendering', () => {
  it('formats each cell once per render, not twice for the title', () => {
    formatted.count = 0
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
      />
    )
    expect(formatted.count).toBe(ROWS.length * COLUMNS.length)
  })

  it('re-renders only the rows the cursor leaves and enters on an arrow key', () => {
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
      />
    )
    const grid = screen.getByRole('grid')
    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    formatted.count = 0
    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    expect(formatted.count).toBe(2 * COLUMNS.length)
  })
})

describe('in the table view', () => {
  it('re-renders only the row whose checkbox was clicked', async () => {
    const details: TableDetails = {
      schema: 'public',
      name: 'things',
      type: 'table',
      columns: COLUMNS,
      primaryKey: ['id'],
      indexes: [],
      foreignKeys: [],
      estimatedRows: ROWS.length
    }
    const ok = <T,>(data: T) => Promise.resolve({ success: true as const, data })
    Object.assign(window, {
      api: {
        db: {
          getRows: () => ok({ rows: ROWS, columns: COLUMNS, totalEstimate: ROWS.length }),
          countRows: () => ok(ROWS.length)
        }
      }
    })
    render(
      <MemoryRouter>
        <ToastProvider>
          <TableDataView connectionId="c1" details={details} />
        </ToastProvider>
      </MemoryRouter>
    )
    await screen.findByText('row 3')

    formatted.count = 0
    fireEvent.click(screen.getByLabelText('Select row 4'))

    // The row actions used to be fresh closures on every render, which rebuilt
    // every row; now the selection bar appearing costs one row.
    expect(await screen.findByText(/selected/)).toBeTruthy()
    expect(formatted.count).toBe(COLUMNS.length)
  })
})

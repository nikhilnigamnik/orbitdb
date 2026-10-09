// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataGrid } from '@renderer/features/tables/components/data-grid'
import type { ColumnInfo } from '@renderer/types'

afterEach(cleanup)

function column(name: string, udtName = 'text', dataType?: string): ColumnInfo {
  return {
    name,
    dataType: dataType ?? udtName,
    udtName,
    isNullable: true,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  }
}

function setup(columns: ColumnInfo[], rows: Record<string, unknown>[], canMutate = false) {
  return render(
    <DataGrid
      columns={columns}
      rows={rows}
      orderBy={null}
      orderDir="asc"
      onSort={vi.fn()}
      onEditRow={vi.fn()}
      onDeleteRow={vi.fn()}
      canMutate={canMutate}
    />
  )
}

// vitest.config.ts pins TZ to Asia/Kolkata, so these offsets are the same on
// any machine - and a non-zero offset means the zone actually renders, rather
// than collapsing to the 'Z' that UTC would produce.
const OFFSET = '+05:30'

describe('blank strings', () => {
  it('quotes an empty string so it is not an empty cell', () => {
    setup([column('note')], [{ note: '' }])
    expect(screen.getByText("''")).toBeTruthy()
  })

  it('quotes whitespace, which is otherwise identical to empty', () => {
    setup([column('note')], [{ note: '  ' }])
    // The default matcher collapses whitespace, which would defeat the point.
    expect(screen.getByText("'  '", { normalizer: (text) => text })).toBeTruthy()
  })

  it('still names null distinctly', () => {
    setup([column('note')], [{ note: null }])
    expect(screen.getByText('NULL')).toBeTruthy()
  })

  it('leaves a value with visible characters unquoted', () => {
    setup([column('note')], [{ note: ' hi ' }])
    expect(screen.queryByText("' hi '")).toBeNull()
  })
})

describe('binary cells', () => {
  it('shows a size rather than the bytes', () => {
    setup([column('thumb', 'bytea')], [{ thumb: new Uint8Array([1, 2, 3]) }])
    expect(screen.getByText('<binary, 3 B>')).toBeTruthy()
  })
})

describe('timestamps', () => {
  it('carries the offset for a timestamptz, as the editor does', () => {
    setup([column('created_at', 'timestamptz')], [{ created_at: new Date('2026-08-09T12:00:00Z') }])
    expect(screen.getByText(`2026-08-09 17:30:00${OFFSET}`)).toBeTruthy()
  })
})

describe('the column header', () => {
  it('puts the name and its type on one line', () => {
    setup([column('created_at', 'timestamptz')], [])
    const wrapper = screen.getByText('created_at').parentElement!

    expect(wrapper.className).not.toContain('flex-col')
    // Both live in the same row, so the type sits beside the name.
    expect(wrapper.textContent).toBe('created_attimestamptz')
  })

  it('pushes the type to the right so types line up down the grid', () => {
    setup([column('created_at', 'timestamptz')], [])
    // The name takes the leftover room, which is what puts the type on the right
    // rather than at a ragged offset that moves with every name.
    expect(screen.getByText('created_at').className).toContain('flex-1')
    expect(screen.getByText('timestamptz').className).toContain('shrink-0')
  })

  it('shows a short type label, not the verbose SQL spelling', () => {
    // "timestamp with time zone" is long enough to crush the column name.
    setup([column('updated_at', 'timestamptz', 'timestamp with time zone')], [])
    const grid = screen.getByText('updated_at').closest('th')!
    expect(grid.textContent).toContain('timestamptz')
  })

  it('lets the name truncate before the type, which is short and load-bearing', () => {
    setup([column('a_very_long_column_name_indeed', 'uuid')], [])
    expect(screen.getByText('a_very_long_column_name_indeed').className).toContain('truncate')
    expect(screen.getByText('uuid').className).toContain('shrink-0')
  })
})

describe('row controls', () => {
  it('reveals the row actions on keyboard focus, not on hover alone', () => {
    // Hover-only would leave anyone tabbing through the grid with invisible
    // controls.
    const { container } = setup([column('id')], [{ id: 1 }], true)
    const actions = container.querySelector('[class*="group-hover:opacity-100"]')
    expect(actions, 'no revealed-on-hover control found').not.toBeNull()
    expect(actions!.className).toContain('focus-within:opacity-100')
  })
})

describe('the Attio grid', () => {
  it('leads each header with a column-type icon', () => {
    setup([column('total', 'int4')], [])
    const th = screen.getByText('total').closest('th')!
    expect(th.querySelector('svg[data-kind="number"]')).not.toBeNull()
  })

  it('draws hairlines on both axes of a data cell', () => {
    setup([column('note')], [{ note: 'hello' }])
    const td = screen.getByText('hello').closest('td')!
    expect(td.className).toContain('border-b')
    expect(td.className).toContain('border-r')
  })

  it('centres the row and header checkboxes in their column', () => {
    // The checkbox is a block-level flex box, so the cell's text-center never
    // moved it - it sat flush against the grid's left edge.
    setup([column('note')], [{ note: 'hello' }])
    for (const name of ['Select all rows', 'Select row 1']) {
      expect(screen.getByLabelText(name).className.split(/\s+/)).toContain('mx-auto')
    }
  })

  it('right-aligns numbers so their digits line up', () => {
    setup([column('label'), column('total', 'int4')], [{ label: 'a', total: 42 }])
    expect(screen.getByText('42').closest('td')!.className).toContain('text-right')
    expect(screen.getByText('a').closest('td')!.className).not.toContain('text-right')
  })

  it('draws an enum value as a tinted tag', () => {
    const status = { ...column('status', 'mood', 'USER-DEFINED'), enumValues: ['open', 'closed'] }
    setup([status], [{ status: 'open' }])
    expect(screen.getByText('open').className).toMatch(/\bbg-tag-/)
  })

  it('keeps a selected row neutral, never accent blue', () => {
    render(
      <DataGrid
        columns={[column('note')]}
        rows={[{ note: 'picked' }]}
        orderBy={null}
        orderDir="asc"
        onSort={vi.fn()}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
        canMutate={false}
        rowSelection={{ 0: true }}
        onRowSelectionChange={vi.fn()}
      />
    )
    const row = screen.getByText('picked').closest('tr')!
    expect(row.className).toContain('bg-row-selected')
    expect(row.className).not.toMatch(/accent/)
  })

  it('carries the row tint into its sticky row-actions cell', () => {
    // That cell is opaque so scrolled content cannot show through it, and it
    // used to stay white - the hover band stopped short of the right edge.
    setup([column('id')], [{ id: 1 }], true)
    const actions = screen.getByTitle('Edit row').closest('td')!
    expect(actions.className).toContain('group-hover:bg-row-hover')
  })
})

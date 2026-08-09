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
// any machine — and a non-zero offset means the zone actually renders, rather
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

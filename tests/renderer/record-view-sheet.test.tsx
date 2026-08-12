// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordViewSheet } from '@renderer/features/tables/components/record-view-sheet'
import type { ColumnInfo, ForeignKeyInfo } from '@renderer/types'

const referencingKeys = vi.fn()
const countRows = vi.fn()
const writeText = vi.fn()

function column(overrides: Partial<ColumnInfo> & Pick<ColumnInfo, 'name'>): ColumnInfo {
  return {
    dataType: 'text',
    udtName: 'text',
    isNullable: true,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null,
    ...overrides
  }
}

const COLUMNS = [
  column({ name: 'id', dataType: 'uuid', udtName: 'uuid', isPrimaryKey: true }),
  column({ name: 'user_id', dataType: 'uuid', udtName: 'uuid' }),
  column({ name: 'purpose' })
]

const FK: ForeignKeyInfo = {
  name: 'verification_tokens_user_id_fkey',
  columns: ['user_id'],
  referencedSchema: 'public',
  referencedTable: 'users',
  referencedColumns: ['id'],
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
}

const ROW = {
  id: '93236b71-d275-47df-b051-5bf1b8988d8b',
  user_id: 'b6db75d6-ebb4-44cb-a060-c344269d465e',
  purpose: 'INVITE'
}

beforeEach(() => {
  referencingKeys.mockReset().mockResolvedValue({ success: true, data: [] })
  countRows.mockReset().mockResolvedValue({ success: true, data: 0 })
  writeText.mockReset().mockResolvedValue(undefined)
  Object.assign(window, { api: { db: { referencingKeys, countRows } } })
  Object.assign(navigator, { clipboard: { writeText } })
})

afterEach(cleanup)

function setup(overrides: Partial<React.ComponentProps<typeof RecordViewSheet>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    connectionId: 'c1',
    schema: 'public',
    table: 'verification_tokens',
    columns: COLUMNS,
    row: ROW as Record<string, unknown>,
    foreignKeys: [FK],
    onOpenForeignKey: vi.fn(),
    onCopied: vi.fn(),
    onCopyFailed: vi.fn(),
    ...overrides
  }
  render(
    <MemoryRouter>
      <RecordViewSheet {...props} />
    </MemoryRouter>
  )
  return props
}

/** The row a field is laid out in - label on one side, value on the other. */
function field(name: string): HTMLElement {
  const label = screen.getByTitle(name)
  const row = label.closest('div.group')
  if (!row) throw new Error(`no field row for ${name}`)
  return row as HTMLElement
}

describe('how a field is laid out', () => {
  it('puts the type with the column name, not with the value', async () => {
    // It describes the column. Under the value it read as part of the data and
    // cost every field a second line.
    setup()
    const row = field('id')
    const [label] = Array.from(row.children)

    expect(within(label as HTMLElement).getByText('uuid')).toBeTruthy()
  })

  it('marks the primary key', () => {
    setup()
    expect(within(field('id')).getByText('PK')).toBeTruthy()
  })

  it('shows the value in full rather than truncating it', () => {
    // A grid cell already cut this off; showing it whole is the point of the view.
    setup()
    expect(within(field('id')).getByText(ROW.id)).toBeTruthy()
  })
})

describe('following a foreign key', () => {
  it('names the table it goes to instead of showing a bare arrow', () => {
    setup()
    expect(within(field('user_id')).getByText('users')).toBeTruthy()
  })

  it('offers no link on a column that has no foreign key', () => {
    setup()
    expect(within(field('purpose')).queryByText('users')).toBeNull()
  })

  it('offers no link when the value is NULL, since there is nothing to open', () => {
    setup({ row: { ...ROW, user_id: null } })
    expect(within(field('user_id')).queryByText('users')).toBeNull()
  })

  it('follows with the column and its value', () => {
    const props = setup()
    fireEvent.click(screen.getByLabelText('Go to public.users.id'))

    expect(props.onOpenForeignKey).toHaveBeenCalledWith('user_id', ROW.user_id)
  })
})

describe('copying', () => {
  it('copies one field as its bare value, not as an object', async () => {
    // `{"purpose": "INVITE"}` is not what someone copying one field wants back.
    const props = setup()
    fireEvent.click(screen.getByLabelText('Copy purpose'))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('"INVITE"'))
    expect(props.onCopied).toHaveBeenCalledWith('purpose')
  })

  it('still copies the whole record as JSON', async () => {
    setup()
    fireEvent.click(screen.getByText('Copy'))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual([ROW])
  })

  it('reports a clipboard the browser refused rather than failing silently', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const props = setup()

    fireEvent.click(screen.getByLabelText('Copy purpose'))

    await waitFor(() => expect(props.onCopyFailed).toHaveBeenCalled())
  })
})

describe('the field filter', () => {
  const many = Array.from({ length: 14 }, (_, i) => column({ name: `col_${i}` }))
  const wideRow = Object.fromEntries(many.map((c, i) => [c.name, `value ${i}`]))

  it('stays out of the way on a narrow table', () => {
    setup()
    expect(screen.queryByLabelText('Filter fields')).toBeNull()
  })

  it('appears once a record is too long to scan', () => {
    setup({ columns: many, row: wideRow, foreignKeys: [] })
    expect(screen.getByLabelText('Filter fields')).toBeTruthy()
  })

  it('narrows to the matching fields', () => {
    setup({ columns: many, row: wideRow, foreignKeys: [] })

    fireEvent.change(screen.getByLabelText('Filter fields'), { target: { value: 'col_1' } })

    // col_1 and col_10..col_13.
    expect(screen.getAllByTitle(/^col_1/)).toHaveLength(5)
    expect(screen.queryByTitle('col_2')).toBeNull()
  })

  it('says so rather than showing an empty card when nothing matches', () => {
    setup({ columns: many, row: wideRow, foreignKeys: [] })

    fireEvent.change(screen.getByLabelText('Filter fields'), { target: { value: 'zzz' } })

    expect(screen.getByText(/No field matches/)).toBeTruthy()
  })
})

describe('scrolling a long record', () => {
  const many = Array.from({ length: 40 }, (_, i) => column({ name: `col_${i}` }))
  const longRow = Object.fromEntries(many.map((c, i) => [c.name, `value ${i}`]))

  it('lets the fields overflow the scroll region instead of collapsing into it', () => {
    // A flex item whose overflow is not `visible` has an automatic minimum size
    // of zero, so the card shrank to fit and clipped its own rows - the fields
    // simply vanished and nothing scrolled. jsdom does no layout, so the guard
    // has to be the class that prevents it.
    setup({ columns: many, row: longRow, foreignKeys: [] })

    const card = screen.getByTitle('col_0').closest('div.group')?.parentElement?.parentElement
    expect(card?.className).toContain('overflow-hidden')
    expect(card?.className, 'a clipping flex item must not be shrinkable').toContain('shrink-0')
  })

  it('keeps the field list inside a scrollable region rather than growing the sheet', () => {
    setup({ columns: many, row: longRow, foreignKeys: [] })

    const card = screen.getByTitle('col_0').closest('div.group')?.parentElement?.parentElement
    const scroller = card?.parentElement
    expect(scroller?.className).toContain('overflow-auto')
    expect(scroller?.className, 'the scroller must be allowed to shrink').toContain('min-h-0')
  })
})

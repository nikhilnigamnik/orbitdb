// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DdlDialog } from '@renderer/features/database/components/ddl-dialog'
import type { ColumnInfo, DdlFormKind } from '@renderer/types'

const ddlPreview = vi.fn()
const ddlExecute = vi.fn()

beforeEach(() => {
  ddlPreview.mockReset().mockResolvedValue({ success: true, data: 'ALTER TABLE "users" ...' })
  ddlExecute.mockReset().mockResolvedValue({ success: true, data: undefined })
  Object.assign(window, { api: { db: { ddlPreview, ddlExecute } } })
})

afterEach(cleanup)

const columns: ColumnInfo[] = [
  {
    name: 'id',
    dataType: 'integer',
    udtName: 'int4',
    isNullable: false,
    isPrimaryKey: true,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  }
]

function setup(kind: DdlFormKind, target?: string) {
  const onSuccess = vi.fn()
  render(
    <DdlDialog
      isOpen
      onClose={vi.fn()}
      connectionId="c1"
      schema="public"
      table="users"
      columns={columns}
      kind={kind}
      target={target}
      onSuccess={onSuccess}
    />
  )
  return { onSuccess }
}

const runButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /run statement|run & drop/i }) as HTMLButtonElement

describe('adding a column that cannot exist', () => {
  it('says why, and refuses to run it', async () => {
    // Every engine rejects NOT NULL with no default on a table with rows. The
    // form knows both facts, so the database should not be the one to find out.
    setup('add-column')
    fireEvent.change(screen.getByLabelText(/column name/i), { target: { value: 'email' } })
    fireEvent.change(screen.getByLabelText(/data type/i), { target: { value: 'text' } })
    fireEvent.click(screen.getByRole('switch'))

    expect(await screen.findByText(/needs a default/i)).toBeTruthy()
    await waitFor(() => expect(runButton().disabled).toBe(true))
  })

  it('is satisfied by a default', async () => {
    setup('add-column')
    fireEvent.change(screen.getByLabelText(/column name/i), { target: { value: 'email' } })
    fireEvent.change(screen.getByLabelText(/data type/i), { target: { value: 'text' } })
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByLabelText(/default/i), { target: { value: "''" } })

    await waitFor(() => expect(screen.queryByText(/needs a default/i)).toBeNull())
  })

  it('leaves a nullable column alone', async () => {
    setup('add-column')
    fireEvent.change(screen.getByLabelText(/column name/i), { target: { value: 'email' } })
    fireEvent.change(screen.getByLabelText(/data type/i), { target: { value: 'text' } })

    await waitFor(() => expect(ddlPreview).toHaveBeenCalled())
    expect(screen.queryByText(/needs a default/i)).toBeNull()
  })
})

describe('the preview', () => {
  it('is held back rather than issued per keystroke', async () => {
    setup('add-column')
    // Fill the type first: the operation is null until both fields are set, so
    // typing the name first would produce no previews to count at all.
    fireEvent.change(screen.getByLabelText(/data type/i), { target: { value: 'text' } })
    const name = screen.getByLabelText(/column name/i)
    fireEvent.change(name, { target: { value: 'e' } })
    fireEvent.change(name, { target: { value: 'em' } })
    fireEvent.change(name, { target: { value: 'ema' } })
    fireEvent.change(name, { target: { value: 'emai' } })
    fireEvent.change(name, { target: { value: 'email' } })

    await waitFor(() => expect(ddlPreview).toHaveBeenCalled())
    await waitFor(() =>
      expect(ddlPreview).toHaveBeenCalledWith(
        expect.objectContaining({ operation: expect.objectContaining({ name: 'email' }) })
      )
    )
    // Five keystrokes over a valid operation; undebounced that is five IPC calls.
    expect(ddlPreview.mock.calls.length).toBeLessThan(5)
  })
})

describe('destructive operations', () => {
  it('warns about the column it will drop, naming it', async () => {
    setup('drop-column', 'email')
    expect(await screen.findByText(/Dropping column "email"/)).toBeTruthy()
  })

  it('warns about the index it will drop, naming it', async () => {
    setup('drop-index', 'users_email_idx')
    expect(await screen.findByText(/Dropping index "users_email_idx"/)).toBeTruthy()
  })
})

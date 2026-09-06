// @vitest-environment jsdom
import * as React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SavedViewsMenu } from '@renderer/features/tables/components/saved-views-menu'
import type { SavedTableView } from '@renderer/types'

afterEach(cleanup)

function view(id: string, name: string): SavedTableView {
  return {
    id,
    connectionId: 'c1',
    schema: 'public',
    table: 'users',
    name,
    view: {
      filters: [],
      filterJoin: 'and',
      orderBy: null,
      orderDir: 'asc',
      hiddenColumns: [],
      frozenColumns: [],
      pageSize: 50
    },
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z'
  }
}

const active = view('1', 'Active users')
const archived = view('2', 'Archived')

interface Handlers {
  onApply: ReturnType<typeof vi.fn>
  onSave: ReturnType<typeof vi.fn>
  onOverwrite: ReturnType<typeof vi.fn>
  onRename: ReturnType<typeof vi.fn>
  onDelete: ReturnType<typeof vi.fn>
}

function setup(
  props: Partial<React.ComponentProps<typeof SavedViewsMenu>> = {}
): Handlers & { open: () => void } {
  const handlers: Handlers = {
    onApply: vi.fn(),
    onSave: vi.fn(),
    onOverwrite: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn()
  }
  render(
    <SavedViewsMenu
      views={[active, archived]}
      activeView={null}
      isDirty={false}
      {...handlers}
      {...props}
    />
  )
  return {
    ...handlers,
    open: () => fireEvent.click(screen.getByTitle('Saved views'))
  }
}

describe('the trigger', () => {
  it('names the applied view rather than the control', () => {
    setup({ activeView: active })
    expect(screen.getByTitle('Saved views').textContent).toContain('Active users')
  })

  it('says the screen has drifted from it', () => {
    setup({ activeView: active, isDirty: true })
    expect(screen.getByTitle('Saved views').textContent).toContain('modified')
  })

  it('says nothing about drift when no view is applied', () => {
    // Nothing to have drifted from - the count is the useful thing instead.
    setup({ isDirty: true })
    const label = screen.getByTitle('Saved views').textContent ?? ''
    expect(label).not.toContain('modified')
    expect(label).toContain('2')
  })
})

describe('the list', () => {
  it('applies the view that was clicked', () => {
    const { open, onApply } = setup()
    open()
    fireEvent.click(screen.getByText('Archived'))
    expect(onApply).toHaveBeenCalledWith(archived)
  })

  it('deletes without also applying, since the two are separate buttons', () => {
    // A row that owns its whole activation would apply the view on the way to
    // its own delete control.
    const { open, onApply, onDelete } = setup()
    open()
    fireEvent.click(screen.getByLabelText('Delete Archived'))
    expect(onDelete).toHaveBeenCalledWith(archived)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('offers to update the applied view only once it has drifted', () => {
    const { open } = setup({ activeView: active, isDirty: false })
    open()
    expect(screen.queryByLabelText(/Update Active users/)).toBeNull()
  })

  it('updates the applied view to what is on screen', () => {
    const { open, onOverwrite } = setup({ activeView: active, isDirty: true })
    open()
    fireEvent.click(screen.getByLabelText('Update Active users to the current view'))
    expect(onOverwrite).toHaveBeenCalledWith(active)
  })

  it('renames in place', () => {
    const { open, onRename } = setup()
    open()
    fireEvent.click(screen.getByLabelText('Rename Archived'))
    const input = screen.getByLabelText('Rename Archived') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  Old orders  ' } })
    fireEvent.submit(input)
    expect(onRename).toHaveBeenCalledWith(archived, 'Old orders')
  })

  it('ignores a rename that changes nothing', () => {
    const { open, onRename } = setup()
    open()
    fireEvent.click(screen.getByLabelText('Rename Archived'))
    fireEvent.submit(screen.getByLabelText('Rename Archived'))
    expect(onRename).not.toHaveBeenCalled()
  })
})

describe('saving', () => {
  it('saves under the typed name, trimmed', () => {
    const { open, onSave } = setup()
    open()
    const input = screen.getByLabelText('Name this view')
    fireEvent.change(input, { target: { value: '  Pro accounts  ' } })
    fireEvent.submit(input)
    expect(onSave).toHaveBeenCalledWith('Pro accounts')
  })

  it('will not save an empty name', () => {
    const { open, onSave } = setup()
    open()
    const input = screen.getByLabelText('Name this view')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('warns that an existing name will be replaced, whatever its casing', () => {
    // Saving is an upsert in the store, so the name is the only warning the user
    // gets before one view overwrites another.
    const { open } = setup()
    open()
    fireEvent.change(screen.getByLabelText('Name this view'), {
      target: { value: 'archived' }
    })
    expect(screen.getByText(/Replaces the existing/)).toBeTruthy()
  })
})

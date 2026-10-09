// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionFormSheet } from '@renderer/features/connections/components/connection-form-sheet'
import type { SavedConnection } from '@renderer/types'

afterEach(cleanup)

const saved: SavedConnection = {
  id: 'c1',
  name: 'Local',
  engine: 'postgres',
  environment: 'dev',
  host: 'localhost',
  port: 5432,
  database: 'app',
  user: 'me',
  password: '',
  hasPassword: true,
  ssl: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

function mount(initial: SavedConnection | null = null) {
  const test = vi.fn(() => Promise.resolve({ success: true, data: { success: true } }))
  const update = vi.fn((_id: string, input: unknown) =>
    Promise.resolve({ success: true, data: { ...saved, ...(input as object) } })
  )
  Object.assign(window, { api: { connections: { test, update } } })
  const onClose = vi.fn()
  render(<ConnectionFormSheet isOpen onClose={onClose} onSaved={vi.fn()} initial={initial} />)
  return { onClose, test, update }
}

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
}

describe('a saved password', () => {
  it('is never pre-filled, and says it is kept when left blank', () => {
    mount(saved)
    const input = screen.getByLabelText('Password') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toMatch(/^Saved/)
    expect(screen.getByText('Leave blank to keep the saved one.')).toBeTruthy()
  })

  it('is tested by id, so main can fill it in', async () => {
    const { test } = mount(saved)
    fireEvent.click(screen.getByRole('button', { name: /Test/ }))
    await waitFor(() => expect(test).toHaveBeenCalled())
    expect(test.mock.calls[0]).toEqual([expect.objectContaining({ password: '' }), 'c1'])
  })
})

describe('certificate verification', () => {
  it('defaults on for a new SSL connection', () => {
    mount()
    fireEvent.click(screen.getByRole('switch', { name: 'Use SSL' }))
    const verify = screen.getByRole('switch', { name: /Verify server certificate/ })
    expect(verify.getAttribute('aria-checked')).toBe('true')
  })

  it('stays off for an existing SSL connection saved before it existed', () => {
    mount(saved)
    const verify = screen.getByRole('switch', { name: /Verify server certificate/ })
    expect(verify.getAttribute('aria-checked')).toBe('false')
  })

  it('is hidden while SSL is off', () => {
    mount()
    expect(screen.queryByRole('switch', { name: /Verify server certificate/ })).toBeNull()
  })
})

describe('closing with unsaved edits', () => {
  it('closes straight away when nothing changed', () => {
    const { onClose } = mount(saved)
    pressEscape()
    expect(onClose).toHaveBeenCalled()
  })

  it('asks first, and keeps the form when the user goes back', async () => {
    const { onClose } = mount(saved)
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Renamed' } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByText('Discard unsaved changes?')).toBeNull())
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Renamed')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('discards on confirmation', async () => {
    const { onClose } = mount(saved)
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Renamed' } })

    pressEscape()
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not ask after a save', async () => {
    const { onClose, update } = mount(saved)
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(update).toHaveBeenCalled()
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull()
  })
})

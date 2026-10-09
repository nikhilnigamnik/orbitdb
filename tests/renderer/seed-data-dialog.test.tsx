// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SeedDataDialog } from '@renderer/features/database/components/seed-data-dialog'

afterEach(cleanup)

describe('while seeding', () => {
  it('cannot be cancelled or dismissed, since the inserts would carry on', async () => {
    // Never resolves: the seed is still in flight for the whole test.
    const generateSeed = vi.fn(() => new Promise(() => {}))
    Object.assign(window, { api: { ai: { generateSeed } } })
    const onClose = vi.fn()
    render(
      <SeedDataDialog
        open
        onClose={onClose}
        connectionId="c1"
        schema="public"
        table="users"
        onApplied={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Generate & insert 10'))
    expect(await screen.findByText(/Generating/)).toBeTruthy()

    const cancel = screen.getByText('Cancel').closest('button')!
    expect(cancel.disabled).toBe(true)

    fireEvent.keyDown(cancel, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

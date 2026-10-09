// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '@renderer/components/ui/toast'
import { AppearanceSettings } from '@renderer/features/settings/components/appearance-settings'
import { ThemeProvider } from '@renderer/features/settings/theme'
import type { ThemePreference } from '@renderer/types'

afterEach(cleanup)

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

function setup(stored: ThemePreference, setTheme = vi.fn((t: ThemePreference) => ok(t))) {
  Object.assign(window, {
    api: { app: { getTheme: vi.fn(() => ok(stored)), setTheme } }
  })
  render(
    <ThemeProvider>
      <ToastProvider>
        <AppearanceSettings />
      </ToastProvider>
    </ThemeProvider>
  )
  return { setTheme }
}

describe('AppearanceSettings', () => {
  it('offers system, light and dark, with the stored one selected', async () => {
    setup('dark')
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(group).toBeTruthy()
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'System',
      'Light',
      'Dark'
    ])
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true')
    )
  })

  it('saves a new choice through main', async () => {
    const { setTheme } = setup('system')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe(
        'true'
      )
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))

    await waitFor(() => expect(setTheme).toHaveBeenCalledWith('light'))
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true')
  })

  it('puts the old choice back and says so when the save fails', async () => {
    const setTheme = vi.fn(() => Promise.resolve({ success: false as const, error: 'disk full' }))
    setup('light', setTheme)
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true')
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))

    await screen.findByText('Could not change the theme')
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true')
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ShortcutsOverlay } from '@renderer/components/common/shortcuts-overlay'
import { SHORTCUT_GROUPS, shortcutParts } from '@renderer/config/shortcuts'

afterEach(cleanup)

function press(key: string, target: Element | Document = document) {
  fireEvent.keyDown(target, { key })
}

describe('opening it', () => {
  it('appears on ? and closes on ? again', async () => {
    render(<ShortcutsOverlay />)
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()

    press('?')
    expect(await screen.findByText('Keyboard shortcuts')).toBeTruthy()

    press('?')
    await waitFor(() => expect(screen.queryByText('Keyboard shortcuts')).toBeNull())
  })

  it('stays shut while someone is typing', () => {
    // `?` is a character, and a filter box is where it usually gets typed.
    render(
      <>
        <input aria-label="a field" />
        <ShortcutsOverlay />
      </>
    )

    press('?', screen.getByLabelText('a field'))

    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
  })

  it('stays shut inside the SQL editor, which is a contenteditable', () => {
    render(
      <>
        <div className="cm-editor">
          <div data-testid="cm-content" />
        </div>
        <ShortcutsOverlay />
      </>
    )

    press('?', screen.getByTestId('cm-content'))

    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
  })

  it('ignores ? with a modifier held, which is a different chord', () => {
    render(<ShortcutsOverlay />)
    fireEvent.keyDown(document, { key: '?', metaKey: true })

    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
  })
})

describe('what it lists', () => {
  it('renders every group and shortcut from the config', async () => {
    // The overlay reads the same list the app implements, so a shortcut cannot
    // be documented here as something it no longer does.
    render(<ShortcutsOverlay />)
    press('?')
    await screen.findByText('Keyboard shortcuts')

    for (const group of SHORTCUT_GROUPS) {
      expect(screen.getByText(group.title), group.title).toBeTruthy()
      for (const shortcut of group.shortcuts) {
        expect(screen.getByText(shortcut.description), shortcut.description).toBeTruthy()
      }
    }
  })
})

describe('splitting a chord into keys', () => {
  it('drops the plus and keeps each key', () => {
    expect(shortcutParts('Mod+Shift+C', false)).toEqual(['Ctrl', 'Shift', 'C'])
  })

  it('resolves Mod per platform', () => {
    expect(shortcutParts('Mod+K', true)).toEqual(['⌘', 'K'])
    expect(shortcutParts('Mod+K', false)).toEqual(['Ctrl', 'K'])
  })

  it('keeps a space-separated run as separate keys', () => {
    expect(shortcutParts('↑ ↓ ← →', false)).toEqual(['↑', '↓', '←', '→'])
  })

  it('keeps a slash, which reads as "or"', () => {
    expect(shortcutParts('Home / End', false)).toEqual(['Home', '/', 'End'])
  })

  it('handles a single key', () => {
    expect(shortcutParts('?', false)).toEqual(['?'])
  })
})

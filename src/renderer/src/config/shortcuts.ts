/**
 * Every keyboard shortcut in the app, in one place.
 *
 * The overlay renders this list rather than a hand-written copy of it, so a
 * shortcut cannot be documented as something it no longer does. Keys are
 * written with `Mod`, which the renderer resolves per platform.
 */

export interface Shortcut {
  keys: string
  description: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: 'Mod+K', description: 'Search tables, connections and actions' },
      { keys: 'Mod+Shift+F', description: 'Find a value in every table' },
      { keys: '?', description: 'Show this list' }
    ]
  },
  {
    title: 'Data grid',
    shortcuts: [
      { keys: '↑ ↓ ← →', description: 'Move the cell cursor' },
      { keys: 'Shift+arrows', description: 'Extend the selection' },
      { keys: 'Mod+↑ / Mod+↓', description: 'Jump to the first or last row' },
      { keys: 'Home / End', description: 'Jump to the start or end of the row' },
      { keys: 'Enter', description: 'Edit the cell under the cursor' },
      { keys: 'Escape', description: 'Clear the cursor, or cancel an edit' },
      { keys: 'Mod+C', description: 'Copy the selection as text' },
      { keys: 'Mod+Shift+C', description: 'Copy the selection as JSON' },
      { keys: 'Double-click', description: 'Edit a cell' },
      { keys: 'Shift+click', description: 'Extend the selection to a cell' }
    ]
  },
  {
    title: 'Table view',
    shortcuts: [{ keys: 'Mod+I', description: 'Filter this table with natural language' }]
  },
  {
    title: 'SQL editor',
    shortcuts: [
      { keys: 'Mod+Enter', description: 'Run the query' },
      { keys: 'Mod+Z / Mod+Shift+Z', description: 'Undo and redo' },
      { keys: 'Tab', description: 'Indent, or accept a completion' }
    ]
  }
]

/** The symbol a platform uses for `Mod`: Command on a Mac, Ctrl everywhere else. */
export function modKeyLabel(isMac: boolean): string {
  return isMac ? '⌘' : 'Ctrl'
}

/**
 * A shortcut split into the pieces a `Kbd` renders. Separators (`/`, spaces
 * between arrows) survive as their own parts so the row still reads as prose.
 */
export function shortcutParts(keys: string, isMac: boolean): string[] {
  return keys
    .split(/(\s+|\+)/)
    .map((part) => part.trim())
    .filter((part) => part !== '' && part !== '+')
    .map((part) => (part === 'Mod' ? modKeyLabel(isMac) : part))
}

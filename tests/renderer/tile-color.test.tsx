// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchemaTree } from '@renderer/features/database/components/schema-tree'
import { ReferencedBy } from '@renderer/features/tables/components/referenced-by'
import { CommandPaletteProvider } from '@renderer/features/command-palette/store'
import { TILE_COLORS, tileColor } from '@renderer/features/database/lib/tile-color'
import type { ReferencingKeyInfo, TableInfo } from '@renderer/types'

// The sidebar and the row editor's Referenced-by panel used to keep their own
// copy of the hash with palettes of different sizes, so the same table could
// be blue in one and rose in the other.

const ORDERS: TableInfo = { schema: 'public', name: 'orders', type: 'table', estimatedRows: null }

const ORDERS_KEY: ReferencingKeyInfo = {
  name: 'orders_user_id_fkey',
  schema: 'public',
  table: 'orders',
  columns: ['user_id'],
  referencedSchema: 'public',
  referencedTable: 'users',
  referencedColumns: ['id'],
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
}

beforeEach(() => {
  localStorage.clear()
  Object.assign(window, {
    api: {
      db: {
        listTables: vi.fn().mockResolvedValue({ success: true, data: [ORDERS] }),
        referencingKeys: vi.fn().mockResolvedValue({ success: true, data: [ORDERS_KEY] }),
        countRows: vi.fn().mockResolvedValue({ success: true, data: 3 })
      }
    }
  })
})

afterEach(cleanup)

/** The one coloured tile in a container; both surfaces mark theirs aria-hidden. */
function tileClassIn(container: HTMLElement): string | undefined {
  const tile = container.querySelector('span[aria-hidden][class*="bg-tag-"]')
  return tile?.className.match(/bg-tag-[a-z]+/)?.[0]
}

describe('tileColor', () => {
  it('is stable for a name and never slate, which marks a view', () => {
    expect(tileColor('orders')).toBe(tileColor('orders'))
    expect(TILE_COLORS).toContain(tileColor('orders'))
    expect(TILE_COLORS).not.toContain('bg-tag-slate')
  })
})

describe('the same table on both surfaces', () => {
  it('gets the same tile colour in the sidebar and in Referenced by', async () => {
    const tree = render(
      <MemoryRouter>
        <CommandPaletteProvider>
          <SchemaTree
            connectionId="c1"
            schemas={['public']}
            onRefresh={vi.fn()}
            isLoading={false}
          />
        </CommandPaletteProvider>
      </MemoryRouter>
    )
    await screen.findByText('orders')

    const panel = render(
      <MemoryRouter>
        <ReferencedBy
          connectionId="c1"
          schema="public"
          table="users"
          row={{ id: 42 }}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    )
    await waitFor(() => expect(tileClassIn(panel.container)).toBeDefined())

    expect(tileClassIn(tree.container)).toBe(tileColor('orders'))
    expect(tileClassIn(panel.container)).toBe(tileColor('orders'))
  })
})

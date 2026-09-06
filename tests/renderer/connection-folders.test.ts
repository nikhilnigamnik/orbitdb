import { describe, expect, it } from 'vitest'
import { folderNames, groupByFolder } from '@renderer/features/connections/lib/folders'
import type { SavedConnection } from '@renderer/types'

function connection(name: string, folder?: string): SavedConnection {
  return {
    id: name,
    name,
    engine: 'postgres',
    environment: 'dev',
    folder,
    host: 'localhost',
    port: 5432,
    database: 'app',
    user: 'postgres',
    password: '',
    ssl: false,
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z'
  }
}

describe('the folders in use', () => {
  it('lists each one once, in name order', () => {
    const names = folderNames([
      connection('a', 'Work'),
      connection('b', 'Personal'),
      connection('c', 'Work')
    ])

    expect(names).toEqual(['Personal', 'Work'])
  })

  it('leaves out the connections that were never filed', () => {
    expect(folderNames([connection('a'), connection('b', '   '), connection('c', 'Work')])).toEqual(
      ['Work']
    )
  })

  it('folds differently-cased spellings into one', () => {
    // Otherwise typing "work" in the form silently opens a second group beside
    // "Work" that looks identical on screen.
    expect(folderNames([connection('a', 'work'), connection('b', 'Work')])).toHaveLength(1)
  })

  it('heads that group with the spelling most of them use', () => {
    const names = folderNames([
      connection('a', 'Work'),
      connection('b', 'work'),
      connection('c', 'Work')
    ])

    expect(names).toEqual(['Work'])
  })
})

describe('grouping the list', () => {
  it('orders folders by name and puts the ungrouped pile last', () => {
    const groups = groupByFolder([
      connection('a'),
      connection('b', 'Work'),
      connection('c', 'Clients')
    ])

    expect(groups.map((g) => g.folder)).toEqual(['Clients', 'Work', ''])
  })

  it('keeps the order it was handed inside each folder, since the page already sorted', () => {
    const groups = groupByFolder([
      connection('zeta', 'Work'),
      connection('alpha', 'Work'),
      connection('mid', 'Work')
    ])

    expect(groups[0].connections.map((c) => c.name)).toEqual(['zeta', 'alpha', 'mid'])
  })

  it('puts differently-cased spellings in one group under one heading', () => {
    const groups = groupByFolder([
      connection('a', 'work'),
      connection('b', 'Work'),
      connection('c', 'Work')
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].folder).toBe('Work')
    expect(groups[0].connections).toHaveLength(3)
  })

  it('treats whitespace and an absent folder as the same ungrouped pile', () => {
    const groups = groupByFolder([connection('a'), connection('b', '  ')])

    expect(groups).toEqual([{ folder: '', connections: expect.any(Array) }])
    expect(groups[0].connections).toHaveLength(2)
  })

  it('reports no folders at all when nothing has been filed', () => {
    const groups = groupByFolder([connection('a'), connection('b')])

    // The page uses this to decide whether to draw headings, so a lone
    // "Ungrouped" header never appears over a list nobody has organised.
    expect(groups.some((g) => g.folder)).toBe(false)
  })
})

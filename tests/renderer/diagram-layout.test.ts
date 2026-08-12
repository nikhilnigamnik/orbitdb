// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyLayout,
  clearLayout,
  loadLayout,
  positionsOf,
  saveLayout
} from '../../src/renderer/src/features/diagram/lib/diagram-layout'

const KEY = 'orbitdb:diagram-layout:c1:public'

beforeEach(() => {
  localStorage.clear()
})

describe('a round trip', () => {
  it('comes back as it went in', () => {
    const layout = { positions: { 'public.users': { x: 10, y: 20 } }, direction: 'TB' as const }
    saveLayout('c1', 'public', layout)

    expect(loadLayout('c1', 'public')).toEqual(layout)
  })

  it('is scoped per connection and per schema', () => {
    saveLayout('c1', 'public', { positions: { a: { x: 1, y: 1 } }, direction: 'LR' })

    expect(loadLayout('c2', 'public')).toBeNull()
    expect(loadLayout('c1', 'billing')).toBeNull()
  })

  it('is nothing for a schema never arranged', () => {
    expect(loadLayout('c1', 'public')).toBeNull()
  })

  it('writes nothing without a connection', () => {
    saveLayout('', 'public', { positions: { a: { x: 1, y: 1 } }, direction: 'LR' })
    expect(localStorage.length).toBe(0)
  })

  it('forgets an arrangement on request', () => {
    saveLayout('c1', 'public', { positions: { a: { x: 1, y: 1 } }, direction: 'LR' })
    clearLayout('c1', 'public')

    expect(loadLayout('c1', 'public')).toBeNull()
  })
})

describe('reading a file that has drifted', () => {
  it('ignores unparseable JSON', () => {
    localStorage.setItem(KEY, 'not json')
    expect(loadLayout('c1', 'public')).toBeNull()
  })

  it('drops a position that is not a pair of numbers', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        positions: { good: { x: 1, y: 2 }, bad: { x: 'left', y: 2 }, worse: null },
        direction: 'LR'
      })
    )

    expect(loadLayout('c1', 'public')?.positions).toEqual({ good: { x: 1, y: 2 } })
  })

  it('treats a file with no usable positions as no layout', () => {
    // Restoring an empty arrangement would stack every table on the origin.
    localStorage.setItem(KEY, JSON.stringify({ positions: {}, direction: 'LR' }))

    expect(loadLayout('c1', 'public')).toBeNull()
  })

  it('falls back to horizontal for an unknown direction', () => {
    localStorage.setItem(KEY, JSON.stringify({ positions: { a: { x: 0, y: 0 } }, direction: 'up' }))

    expect(loadLayout('c1', 'public')?.direction).toBe('LR')
  })

  it('refuses a non-finite coordinate', () => {
    // JSON.stringify turns Infinity into null, so this arrives as a broken node.
    localStorage.setItem(KEY, JSON.stringify({ positions: { a: { x: Infinity, y: 0 } } }))

    expect(loadLayout('c1', 'public')).toBeNull()
  })
})

describe('applying it to freshly laid-out nodes', () => {
  const NODES = [
    { id: 'a', position: { x: 0, y: 0 } },
    { id: 'b', position: { x: 100, y: 0 } }
  ]

  it('overrides the positions it has', () => {
    const applied = applyLayout(NODES, { a: { x: 50, y: 60 } })

    expect(applied[0].position).toEqual({ x: 50, y: 60 })
  })

  it('leaves a table added since the layout was saved where auto-layout put it', () => {
    // Otherwise a new table stacks at the origin under whatever is already there.
    const applied = applyLayout(NODES, { a: { x: 50, y: 60 } })

    expect(applied[1].position).toEqual({ x: 100, y: 0 })
  })

  it('ignores a saved position for a table that is gone', () => {
    const applied = applyLayout(NODES, { dropped: { x: 5, y: 5 } })

    expect(applied.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the nodes it was given', () => {
    applyLayout(NODES, { a: { x: 50, y: 60 } })
    expect(NODES[0].position).toEqual({ x: 0, y: 0 })
  })
})

describe('reading positions back off the canvas', () => {
  it('keeps only the coordinates, not the rest of the node', () => {
    const positions = positionsOf([
      { id: 'a', position: { x: 1, y: 2 } },
      { id: 'b', position: { x: 3, y: 4 } }
    ])

    expect(positions).toEqual({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } })
  })
})

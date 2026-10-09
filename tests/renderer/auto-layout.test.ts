import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import {
  NODE_WIDTH,
  estimateNodeHeight,
  layoutNodes
} from '../../src/renderer/src/features/diagram/lib/auto-layout'

function tables(count: number, columns = 6): Node[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    position: { x: 0, y: 0 },
    data: {},
    height: estimateNodeHeight(columns)
  }))
}

function bounds(nodes: Node[]) {
  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  const bottoms = nodes.map((n) => n.position.y + (n.height ?? 0))
  return {
    width: Math.max(...xs) + NODE_WIDTH - Math.min(...xs),
    height: Math.max(...bottoms) - Math.min(...ys)
  }
}

function overlaps(a: Node, b: Node): boolean {
  return (
    a.position.x < b.position.x + NODE_WIDTH &&
    b.position.x < a.position.x + NODE_WIDTH &&
    a.position.y < b.position.y + (b.height ?? 0) &&
    b.position.y < a.position.y + (a.height ?? 0)
  )
}

describe('auto-layout', () => {
  it('spreads unrelated tables over rows instead of one tall column', () => {
    // D1 schemas often declare few foreign keys; dagre alone stacked all 53 of
    // one in a single rank, and fitting that to the window made it unreadable.
    const laid = layoutNodes(tables(53), [])
    const { width, height } = bounds(laid)
    expect(width / height).toBeGreaterThan(0.6)
    expect(width / height).toBeLessThan(4)
  })

  it('wraps a hub schema, where most tables point at one, instead of one long rank', () => {
    // Dagre keeps a rank on one line, so forty tables referencing `tenants`
    // made a single column forty tables tall.
    const nodes = tables(41)
    const edges: Edge[] = nodes
      .slice(1)
      .map((n) => ({ id: `e-${n.id}`, source: n.id, target: 't0' }))
    const laid = layoutNodes(nodes, edges, 'LR')
    const { width, height } = bounds(laid)
    expect(width / height).toBeGreaterThan(0.6)
    // Still flows left to right: every referencing table sits left of the hub.
    const hub = laid.find((n) => n.id === 't0')!
    for (const n of laid.slice(1)) expect(n.position.x).toBeLessThan(hub.position.x)
    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) expect(overlaps(laid[i], laid[j])).toBe(false)
    }
  })

  it('never overlaps two tables', () => {
    const nodes = tables(20)
    const edges: Edge[] = [
      { id: 'e1', source: 't1', target: 't0' },
      { id: 'e2', source: 't2', target: 't0' },
      { id: 'e3', source: 't3', target: 't2' }
    ]
    const laid = layoutNodes(nodes, edges)
    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        expect(overlaps(laid[i], laid[j]), `${laid[i].id} overlaps ${laid[j].id}`).toBe(false)
      }
    }
  })

  it('still ranks related tables in the chosen direction', () => {
    const laid = layoutNodes(tables(2), [{ id: 'e', source: 't0', target: 't1' }], 'LR')
    const [from, to] = laid
    expect(from.position.x).toBeLessThan(to.position.x)
  })

  it('leaves an empty schema empty', () => {
    expect(layoutNodes([], [])).toEqual([])
  })
})

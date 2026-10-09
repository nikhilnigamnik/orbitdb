import dagre from 'dagre'
import type { Edge, Node } from '@xyflow/react'

export const NODE_WIDTH = 280
export const NODE_HEADER_HEIGHT = 36
export const NODE_ROW_HEIGHT = 22

export type LayoutDirection = 'LR' | 'TB'

/** Space between packed groups of tables. */
const GROUP_GAP = 80

/**
 * Packed rows are aimed at this width-to-height ratio - a little wider than
 * tall, like the canvas they are fitted into.
 */
const TARGET_ASPECT = 1.6

export function estimateNodeHeight(columnCount: number): number {
  return NODE_HEADER_HEIGHT + Math.max(1, columnCount) * NODE_ROW_HEIGHT + 8
}

interface Box {
  ids: string[]
  /** Positions relative to the group's own top-left corner. */
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
}

function heightOf(node: Node): number {
  return node.height ?? estimateNodeHeight(1)
}

/** Tables joined by foreign keys, each group listed once, in node order. */
function connectedGroups(nodes: Node[], edges: Edge[]): string[][] {
  const parent = new Map(nodes.map((n) => [n.id, n.id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(id, root)
    return root
  }
  for (const edge of edges) {
    if (!parent.has(edge.source) || !parent.has(edge.target)) continue
    parent.set(find(edge.source), find(edge.target))
  }
  const groups = new Map<string, string[]>()
  for (const node of nodes) {
    const root = find(node.id)
    const group = groups.get(root)
    if (group) group.push(node.id)
    else groups.set(root, [node.id])
  }
  return [...groups.values()]
}

function layoutGroup(
  ids: string[],
  byId: Map<string, Node>,
  edges: Edge[],
  direction: LayoutDirection
): Box {
  if (ids.length === 1) {
    const node = byId.get(ids[0])!
    return {
      ids,
      positions: new Map([[ids[0], { x: 0, y: 0 }]]),
      width: NODE_WIDTH,
      height: heightOf(node)
    }
  }
  const members = new Set(ids)
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 80 })
  for (const id of ids) g.setNode(id, { width: NODE_WIDTH, height: heightOf(byId.get(id)!) })
  for (const edge of edges) {
    if (members.has(edge.source) && members.has(edge.target)) g.setEdge(edge.source, edge.target)
  }
  dagre.layout(g)
  return wrapRanks(ids, byId, (id) => g.node(id), direction)
}

/** Gap between tables within a rank, and between the sub-columns of one. */
const RANK_NODE_GAP = 40
/** Gap between consecutive ranks. */
const RANK_GAP = 120

/**
 * Re-flows dagre's ranks so none runs on for ever.
 *
 * Dagre keeps each rank in a single line, so a hub schema - forty tables all
 * pointing at `tenants` - becomes one rank forty tables long, and the fitted
 * view shrinks to nothing. A rank longer than the group's target extent is
 * wrapped into side-by-side sub-columns (sub-rows when laid top to bottom),
 * keeping dagre's order within it and the ranks in their order.
 */
function wrapRanks(
  ids: string[],
  byId: Map<string, Node>,
  placed: (id: string) => { x: number; y: number },
  direction: LayoutDirection
): Box {
  const isLR = direction === 'LR'
  // Dagre centres every node of a rank on the same coordinate along the flow.
  const ranks = new Map<number, string[]>()
  for (const id of ids) {
    const key = Math.round(isLR ? placed(id).x : placed(id).y)
    const rank = ranks.get(key)
    if (rank) rank.push(id)
    else ranks.set(key, [id])
  }
  const ordered = [...ranks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, members]) =>
      members.sort((a, b) => (isLR ? placed(a).y - placed(b).y : placed(a).x - placed(b).x))
    )

  // Along-the-rank extent of one node: its height in LR, its width in TB.
  const extentOf = (id: string) => (isLR ? heightOf(byId.get(id)!) : NODE_WIDTH)
  const totalArea = ids.reduce((sum, id) => sum + NODE_WIDTH * heightOf(byId.get(id)!), 0)
  const longest = Math.max(...ids.map(extentOf))
  const limit = Math.max(
    longest,
    isLR ? Math.sqrt(totalArea / TARGET_ASPECT) * 1.15 : Math.sqrt(totalArea * TARGET_ASPECT) * 1.15
  )

  const positions = new Map<string, { x: number; y: number }>()
  let flow = 0
  let span = 0
  for (const rank of ordered) {
    // Split the rank into lanes, each no longer than the limit.
    const lanes: string[][] = [[]]
    let used = 0
    for (const id of rank) {
      const extent = extentOf(id)
      if (lanes[lanes.length - 1].length > 0 && used + extent > limit) {
        lanes.push([])
        used = 0
      }
      lanes[lanes.length - 1].push(id)
      used += extent + RANK_NODE_GAP
    }
    let laneOffset = 0
    for (const lane of lanes) {
      let along = 0
      let laneDepth = 0
      for (const id of lane) {
        const height = heightOf(byId.get(id)!)
        positions.set(
          id,
          isLR ? { x: flow + laneOffset, y: along } : { x: along, y: flow + laneOffset }
        )
        along += extentOf(id) + RANK_NODE_GAP
        laneDepth = Math.max(laneDepth, isLR ? NODE_WIDTH : height)
      }
      span = Math.max(span, along - RANK_NODE_GAP)
      laneOffset += laneDepth + RANK_NODE_GAP
    }
    flow += laneOffset - RANK_NODE_GAP + RANK_GAP
  }
  const depth = flow - RANK_GAP
  return isLR
    ? { ids, positions, width: depth, height: span }
    : { ids, positions, width: span, height: depth }
}

/**
 * Lays the schema out so it can be read at a fitted zoom.
 *
 * Dagre alone puts every table without a foreign key into the same rank, so a
 * schema with few declared keys - D1's, typically - came out as one column of
 * dozens of tables, which fitting to the window shrank past legibility. Each
 * group of related tables still gets dagre's ranked layout; the groups, and
 * the lone tables, are then packed onto rows that wrap at a width chosen to
 * keep the whole roughly the canvas's shape.
 */
export function layoutNodes<T extends Node>(
  nodes: T[],
  edges: Edge[],
  direction: LayoutDirection = 'LR'
): T[] {
  if (nodes.length === 0) return nodes
  const byId = new Map<string, Node>(nodes.map((n) => [n.id, n]))
  const boxes = connectedGroups(nodes, edges)
    .map((ids) => layoutGroup(ids, byId, edges, direction))
    // Biggest groups first: they anchor the top-left, and the lone tables
    // fill in after them.
    .sort((a, b) => b.ids.length - a.ids.length || b.height - a.height)

  const area = boxes.reduce((sum, b) => sum + (b.width + GROUP_GAP) * (b.height + GROUP_GAP), 0)
  const widest = Math.max(...boxes.map((b) => b.width))
  const rowWidth = Math.max(widest, Math.sqrt(area * TARGET_ASPECT))

  const origin = new Map<string, { x: number; y: number }>()
  let x = 0
  let y = 0
  let rowHeight = 0
  for (const box of boxes) {
    if (x > 0 && x + box.width > rowWidth) {
      x = 0
      y += rowHeight + GROUP_GAP
      rowHeight = 0
    }
    for (const id of box.ids) {
      const p = box.positions.get(id)!
      origin.set(id, { x: x + p.x, y: y + p.y })
    }
    x += box.width + GROUP_GAP
    rowHeight = Math.max(rowHeight, box.height)
  }

  return nodes.map((node) => {
    const position = origin.get(node.id)
    return position ? { ...node, position } : node
  })
}

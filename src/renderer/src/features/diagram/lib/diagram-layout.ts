export interface NodePosition {
  x: number
  y: number
}

export interface SavedLayout {
  positions: Record<string, NodePosition>
  direction: 'LR' | 'TB'
}

/**
 * Where the diagram's tables were left, per connection and schema.
 *
 * Auto-layout is a starting point, not an answer: the arrangement someone drags
 * into place carries what they know about the schema, and recomputing it on
 * every open threw that away.
 */
function key(connectionId: string, schema: string): string {
  return `orbitdb:diagram-layout:${connectionId}:${schema}`
}

function isPosition(value: unknown): value is NodePosition {
  const p = value as Partial<NodePosition> | null
  return (
    !!p &&
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y)
  )
}

export function loadLayout(connectionId: string, schema: string): SavedLayout | null {
  if (!connectionId) return null
  try {
    const raw = localStorage.getItem(key(connectionId, schema))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedLayout>
    const positions: Record<string, NodePosition> = {}
    for (const [id, position] of Object.entries(parsed?.positions ?? {})) {
      if (isPosition(position)) positions[id] = { x: position.x, y: position.y }
    }
    if (Object.keys(positions).length === 0) return null
    return { positions, direction: parsed?.direction === 'TB' ? 'TB' : 'LR' }
  } catch {
    return null
  }
}

export function saveLayout(connectionId: string, schema: string, layout: SavedLayout): void {
  if (!connectionId) return
  try {
    localStorage.setItem(key(connectionId, schema), JSON.stringify(layout))
  } catch {
    // quota / private mode - the layout just won't be remembered
  }
}

export function clearLayout(connectionId: string, schema: string): void {
  if (!connectionId) return
  try {
    localStorage.removeItem(key(connectionId, schema))
  } catch {
    // nothing to do - the next save will overwrite it anyway
  }
}

/**
 * Applies saved positions to freshly laid-out nodes.
 *
 * A table added since the layout was saved keeps the position auto-layout gave
 * it, rather than being stacked at the origin - the saved arrangement is a set
 * of overrides, not a replacement.
 */
export function applyLayout<T extends { id: string; position: NodePosition }>(
  nodes: T[],
  positions: Record<string, NodePosition>
): T[] {
  return nodes.map((node) => {
    const saved = positions[node.id]
    return saved ? { ...node, position: { ...saved } } : node
  })
}

export function positionsOf(
  nodes: { id: string; position: NodePosition }[]
): Record<string, NodePosition> {
  return Object.fromEntries(
    nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
  )
}

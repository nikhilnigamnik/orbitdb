import dagre from 'dagre'
import type { Edge, Node } from '@xyflow/react'

export const NODE_WIDTH = 280
export const NODE_HEADER_HEIGHT = 36
export const NODE_ROW_HEIGHT = 22

export function estimateNodeHeight(columnCount: number): number {
  return NODE_HEADER_HEIGHT + Math.max(1, columnCount) * NODE_ROW_HEIGHT + 8
}

export function layoutNodes<T extends Node>(nodes: T[], edges: Edge[]): T[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 })

  for (const node of nodes) {
    g.setNode(node.id, {
      width: NODE_WIDTH,
      height: node.height ?? estimateNodeHeight(1)
    })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const dagreNode = g.node(node.id)
    if (!dagreNode) return node
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - (node.height ?? estimateNodeHeight(1)) / 2
      }
    }
  })
}

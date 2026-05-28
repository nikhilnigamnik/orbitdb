import * as React from 'react'
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { SchemaGraph } from '@renderer/types'
import { estimateNodeHeight, layoutNodes } from '../lib/auto-layout'
import { TableNode, type TableNodeData } from './table-node'

const nodeTypes: NodeTypes = { table: TableNode }

interface SchemaGraphCanvasProps {
  graph: SchemaGraph
}

function tableId(schema: string, name: string): string {
  return `${schema}.${name}`
}

function buildGraph(graph: SchemaGraph): { nodes: Node[]; edges: Edge[] } {
  const fkColumnsByTable = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    const key = tableId(edge.from.schema, edge.from.table)
    const set = fkColumnsByTable.get(key) ?? new Set<string>()
    for (const col of edge.from.columns) set.add(col)
    fkColumnsByTable.set(key, set)
  }

  const knownIds = new Set(graph.tables.map((t) => tableId(t.schema, t.name)))
  const externalTables = new Map<string, { schema: string; name: string; columns: Set<string> }>()
  for (const edge of graph.edges) {
    const id = tableId(edge.to.schema, edge.to.table)
    if (knownIds.has(id)) continue
    const existing = externalTables.get(id) ?? {
      schema: edge.to.schema,
      name: edge.to.table,
      columns: new Set<string>()
    }
    for (const col of edge.to.columns) existing.columns.add(col)
    externalTables.set(id, existing)
  }

  const nodes: Node[] = []

  for (const table of graph.tables) {
    const id = tableId(table.schema, table.name)
    const fkCols = fkColumnsByTable.get(id) ?? new Set<string>()
    const data: TableNodeData = {
      schema: table.schema,
      name: table.name,
      columns: table.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        isPrimaryKey: c.isPrimaryKey,
        isForeignKey: fkCols.has(c.name)
      }))
    }
    nodes.push({
      id,
      type: 'table',
      data,
      position: { x: 0, y: 0 },
      height: estimateNodeHeight(table.columns.length)
    })
  }

  for (const [id, ext] of externalTables) {
    const columns = [...ext.columns].map((name) => ({
      name,
      dataType: '',
      isPrimaryKey: false,
      isForeignKey: false
    }))
    const data: TableNodeData = {
      schema: ext.schema,
      name: ext.name,
      columns,
      isExternal: true
    }
    nodes.push({
      id,
      type: 'table',
      data,
      position: { x: 0, y: 0 },
      height: estimateNodeHeight(columns.length)
    })
  }

  const edges: Edge[] = graph.edges.map((e, idx) => ({
    id: `fk:${idx}:${e.name}`,
    source: tableId(e.from.schema, e.from.table),
    sourceHandle: e.from.columns[0],
    target: tableId(e.to.schema, e.to.table),
    targetHandle: e.to.columns[0],
    label: e.from.columns.length > 1 ? `${e.from.columns.length} cols` : undefined,
    animated: false,
    style: { stroke: 'var(--color-accent, #7d98f8)', strokeWidth: 1.25 }
  }))

  return { nodes: layoutNodes(nodes, edges), edges }
}

export function SchemaGraphCanvas({ graph }: SchemaGraphCanvasProps) {
  const initial = React.useMemo(() => buildGraph(graph), [graph])
  const [nodes, setNodes] = React.useState<Node[]>(initial.nodes)
  const [edges, setEdges] = React.useState<Edge[]>(initial.edges)

  React.useEffect(() => {
    setNodes(initial.nodes)
    setEdges(initial.edges)
  }, [initial])

  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => setNodes((curr) => applyNodeChanges(changes, curr)),
    []
  )
  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => setEdges((curr) => applyEdgeChanges(changes, curr)),
    []
  )

  return (
    <div className="orbit-flow h-full w-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="rgba(255,255,255,0.06)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}

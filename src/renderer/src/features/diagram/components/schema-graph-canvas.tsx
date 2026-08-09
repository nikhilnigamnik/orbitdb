import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  IconArrowsHorizontal,
  IconArrowsMaximize,
  IconArrowsVertical,
  IconHierarchy2,
  IconPhoto
} from '@tabler/icons-react'
import { toPng, toSvg } from 'html-to-image'
import type { SchemaGraph } from '@renderer/types'
import { tableRoute } from '@renderer/config/routes'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { estimateNodeHeight, layoutNodes, type LayoutDirection } from '../lib/auto-layout'
import { TableNode, type TableNodeData } from './table-node'

const nodeTypes: NodeTypes = { table: TableNode }
const ACCENT = 'var(--color-accent-text, #5c8af5)'

interface SchemaGraphCanvasProps {
  graph: SchemaGraph
  schema: string
}

interface EdgeData {
  rel: string
  [key: string]: unknown
}

function tableId(schema: string, name: string): string {
  return `${schema}.${name}`
}

function buildGraph(
  graph: SchemaGraph,
  direction: LayoutDirection
): { nodes: Node[]; edges: Edge[] } {
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
    data: {
      rel: `${e.from.table}.${e.from.columns.join('+')} → ${e.to.table}.${e.to.columns.join('+')}`
    } satisfies EdgeData,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: ACCENT },
    style: { stroke: ACCENT, strokeWidth: 1.25 }
  }))

  return { nodes: layoutNodes(nodes, edges, direction), edges }
}

interface ToolButtonProps {
  title: string
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ title, onClick, children }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  )
}

function Flow({ graph, schema }: SchemaGraphCanvasProps) {
  const navigate = useNavigate()
  const { fitView, getNodes } = useReactFlow()

  const [direction, setDirection] = React.useState<LayoutDirection>('LR')
  const initial = React.useMemo(() => buildGraph(graph, direction), [graph, direction])
  const [nodes, setNodes] = React.useState<Node[]>(initial.nodes)
  const [edges, setEdges] = React.useState<Edge[]>(initial.edges)
  const [focusId, setFocusId] = React.useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = React.useState<string | null>(null)

  // Rebuild when the graph changes. Direction changes are handled by relayout()
  // (which keeps the current node identities) so manual drags survive a reflow.
  React.useEffect(() => {
    setNodes(initial.nodes)
    setEdges(initial.edges)
    setFocusId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph])

  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => setNodes((curr) => applyNodeChanges(changes, curr)),
    []
  )
  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => setEdges((curr) => applyEdgeChanges(changes, curr)),
    []
  )

  const neighborIds = React.useMemo(() => {
    if (!focusId) return null
    const set = new Set<string>([focusId])
    for (const e of edges) {
      if (e.source === focusId) set.add(e.target)
      if (e.target === focusId) set.add(e.source)
    }
    return set
  }, [focusId, edges])

  const displayNodes = React.useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        className: cn(
          'transition-opacity duration-200',
          neighborIds && !neighborIds.has(n.id) && 'opacity-20'
        )
      })),
    [nodes, neighborIds]
  )

  const displayEdges = React.useMemo(
    () =>
      edges.map((e) => {
        const isConnected = focusId ? e.source === focusId || e.target === focusId : false
        const isHovered = hoveredEdge === e.id
        return {
          ...e,
          animated: isConnected,
          label: isHovered ? (e.data as EdgeData | undefined)?.rel : undefined,
          labelStyle: { fill: 'var(--color-text)', fontSize: 10, fontFamily: 'monospace' },
          labelBgStyle: { fill: 'var(--color-surface)', fillOpacity: 0.92 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          style: {
            ...e.style,
            strokeWidth: isConnected ? 2 : 1.25,
            opacity: focusId && !isConnected ? 0.1 : 1
          }
        }
      }),
    [edges, focusId, hoveredEdge]
  )

  const relayout = React.useCallback(
    (dir: LayoutDirection) => {
      setNodes((curr) => layoutNodes(curr, edges, dir))
      window.setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
    },
    [edges, fitView]
  )

  const toggleDirection = React.useCallback(() => {
    setDirection((prev) => {
      const next = prev === 'LR' ? 'TB' : 'LR'
      relayout(next)
      return next
    })
  }, [relayout])

  const onNodeClick = React.useCallback<NodeMouseHandler>(
    (_, node) => setFocusId((curr) => (curr === node.id ? null : node.id)),
    []
  )

  const onNodeDoubleClick = React.useCallback<NodeMouseHandler>(
    (_, node) => {
      const data = node.data as TableNodeData
      navigate(tableRoute(data.schema, data.name))
    },
    [navigate]
  )

  const exportImage = React.useCallback(
    async (format: 'png' | 'svg') => {
      const viewportEl = document.querySelector(
        '.orbit-flow .react-flow__viewport'
      ) as HTMLElement | null
      if (!viewportEl) return

      const bounds = getNodesBounds(getNodes())
      const padding = 0.12
      const imageWidth = Math.min(4096, Math.max(1200, Math.round(bounds.width * (1 + padding * 2))))
      const imageHeight = Math.min(4096, Math.max(800, Math.round(bounds.height * (1 + padding * 2))))
      const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.1, 4, padding)

      const options = {
        backgroundColor: '#131519',
        width: imageWidth,
        height: imageHeight,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
        }
      }

      const dataUrl =
        format === 'png' ? await toPng(viewportEl, options) : await toSvg(viewportEl, options)
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${schema}-diagram.${format}`
      link.click()
    },
    [getNodes, schema]
  )

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={displayEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onPaneClick={() => setFocusId(null)}
      onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
      onEdgeMouseLeave={() => setHoveredEdge(null)}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="rgba(255,255,255,0.06)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
      <Panel position="top-right">
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface/90 p-1 shadow-lg shadow-black/40 backdrop-blur">
          <ToolButton title="Fit view" onClick={() => fitView({ padding: 0.2, duration: 300 })}>
            <IconArrowsMaximize size={15} />
          </ToolButton>
          <ToolButton title="Re-run auto layout" onClick={() => relayout(direction)}>
            <IconHierarchy2 size={15} />
          </ToolButton>
          <ToolButton
            title={`Layout: ${direction === 'LR' ? 'horizontal' : 'vertical'} — click to flip`}
            onClick={toggleDirection}
          >
            {direction === 'LR' ? (
              <IconArrowsHorizontal size={15} />
            ) : (
              <IconArrowsVertical size={15} />
            )}
          </ToolButton>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <ToolButton title="Export as PNG" onClick={() => exportImage('png')}>
            <IconPhoto size={15} />
          </ToolButton>
          <ToolButton title="Export as SVG" onClick={() => exportImage('svg')}>
            <span className="text-xs font-semibold tracking-tight">SVG</span>
          </ToolButton>
        </div>
      </Panel>
    </ReactFlow>
  )
}

export function SchemaGraphCanvas({ graph, schema }: SchemaGraphCanvasProps) {
  return (
    <div className="orbit-flow h-full w-full">
      <ReactFlowProvider>
        <Flow graph={graph} schema={schema} />
      </ReactFlowProvider>
    </div>
  )
}

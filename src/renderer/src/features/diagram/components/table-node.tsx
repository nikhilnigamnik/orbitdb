import { Handle, Position, type NodeProps } from '@xyflow/react'
import { IconKey, IconLink, IconTable } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { NODE_HEADER_HEIGHT, NODE_ROW_HEIGHT, NODE_WIDTH } from '../lib/auto-layout'

const TYPE_SHORT: Array<[RegExp, string]> = [
  [/^timestamp without time zone$/i, 'timestamp'],
  [/^timestamp with time zone$/i, 'timestamptz'],
  [/^time without time zone$/i, 'time'],
  [/^time with time zone$/i, 'timetz'],
  [/^character varying$/i, 'varchar'],
  [/^character$/i, 'char'],
  [/^double precision$/i, 'double'],
  [/^numeric$/i, 'numeric'],
  [/^integer$/i, 'int'],
  [/^bigint$/i, 'int8'],
  [/^smallint$/i, 'int2'],
  [/^boolean$/i, 'bool']
]

function shortenDataType(type: string): string {
  for (const [pattern, replacement] of TYPE_SHORT) {
    if (pattern.test(type)) return replacement
  }
  return type
}

export interface TableNodeData {
  schema: string
  name: string
  columns: {
    name: string
    dataType: string
    isPrimaryKey: boolean
    isForeignKey: boolean
  }[]
  isExternal?: boolean
  [key: string]: unknown
}

// Handles only anchor the edges - nothing here can be connected by dragging -
// so they stay invisible rather than dotting both sides of every row.
const HANDLE_CLASS = 'h-2! w-2! min-w-0! border-0! bg-transparent! opacity-0!'

export function TableNode({ data, selected }: NodeProps) {
  const node = data as TableNodeData
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        'overflow-hidden rounded-xl border bg-surface text-text shadow-card transition-[border-color,box-shadow]',
        selected ? 'border-accent ring-2 ring-accent/15' : 'border-border',
        node.isExternal && 'border-dashed border-border-strong opacity-70'
      )}
    >
      <div
        className="flex items-center gap-2 border-b border-border px-3"
        style={{ height: NODE_HEADER_HEIGHT }}
      >
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-md text-white',
            node.isExternal ? 'bg-tag-slate' : 'bg-tag-blue'
          )}
        >
          <IconTable size={12} stroke={2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{node.name}</span>
        <span className="shrink-0 text-[12px] text-text-subtle">{node.schema}</span>
      </div>

      <div className="py-1">
        {node.columns.length === 0 ? (
          <div
            className="flex items-center px-3 text-xs text-text-subtle"
            style={{ height: NODE_ROW_HEIGHT }}
          >
            no columns
          </div>
        ) : (
          node.columns.map((col) => (
            <div
              key={col.name}
              style={{ height: NODE_ROW_HEIGHT }}
              className="relative flex min-w-0 items-center gap-1.5 px-3 text-xs hover:bg-surface-elevated/60"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={col.name}
                className={HANDLE_CLASS}
                style={{ left: -4 }}
              />
              <span className="flex w-3.5 shrink-0 items-center justify-center">
                {col.isPrimaryKey ? (
                  <IconKey size={12} className="text-warning" />
                ) : col.isForeignKey ? (
                  <IconLink size={12} className="text-info" />
                ) : null}
              </span>
              <span
                title={col.name}
                className={cn(
                  'min-w-0 flex-1 truncate',
                  col.isPrimaryKey ? 'font-medium text-text' : 'text-text-muted'
                )}
              >
                {col.name}
              </span>
              <span
                title={col.dataType}
                className="ml-1 max-w-[45%] shrink-0 truncate text-text-subtle"
              >
                {shortenDataType(col.dataType)}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={col.name}
                className={HANDLE_CLASS}
                style={{ right: -4 }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

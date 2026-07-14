import { Handle, Position, type NodeProps } from '@xyflow/react'
import { IconKey, IconLink } from '@tabler/icons-react'
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

export function TableNode({ data, selected }: NodeProps) {
  const node = data as TableNodeData
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        'overflow-hidden rounded-md border bg-surface text-text shadow-lg shadow-black/40 ring-1 ring-inset ring-white/5',
        selected ? 'border-accent' : 'border-border',
        node.isExternal && 'opacity-70'
      )}
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-border bg-surface-elevated/60 px-2.5 font-mono text-xs font-semibold text-text"
        style={{ height: NODE_HEADER_HEIGHT }}
      >
        <span className="truncate">{node.name}</span>
        <span className="shrink-0 text-xs font-normal uppercase tracking-[0.08em] text-text-subtle">
          {node.schema}
        </span>
      </div>

      <div>
        {node.columns.length === 0 ? (
          <div
            className="flex items-center px-2.5 font-mono text-xs italic text-text-subtle"
            style={{ height: NODE_ROW_HEIGHT }}
          >
            no columns
          </div>
        ) : (
          node.columns.map((col) => (
            <div
              key={col.name}
              style={{ height: NODE_ROW_HEIGHT }}
              className="relative flex min-w-0 items-center gap-1.5 px-2.5 font-mono text-xs text-text-muted hover:bg-surface-elevated/40"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={col.name}
                className="h-2! w-2! min-w-0! border-0! bg-accent/60!"
                style={{ left: -4 }}
              />
              <span className="flex w-3 shrink-0 items-center justify-center text-text-subtle">
                {col.isPrimaryKey ? (
                  <IconKey size={9} className="text-amber-300" />
                ) : col.isForeignKey ? (
                  <IconLink size={9} className="text-sky-300" />
                ) : null}
              </span>
              <span
                title={col.name}
                className={cn(
                  'min-w-0 flex-1 truncate',
                  col.isPrimaryKey ? 'font-semibold text-text' : 'text-text-muted'
                )}
              >
                {col.name}
              </span>
              <span
                title={col.dataType}
                className="ml-1 max-w-[45%] shrink-0 truncate text-xs uppercase text-text-subtle"
              >
                {shortenDataType(col.dataType)}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={col.name}
                className="h-2! w-2! min-w-0! border-0! bg-accent/60!"
                style={{ right: -4 }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

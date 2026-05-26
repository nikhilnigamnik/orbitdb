import { IconTable, IconEye } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import type { TableDetails } from '@renderer/types'

interface TableHeaderProps {
  details: TableDetails
  activeTab: 'data' | 'structure'
  onChangeTab: (tab: 'data' | 'structure') => void
}

const TYPE_LABEL: Record<TableDetails['type'], string> = {
  table: 'Table',
  view: 'View',
  materialized_view: 'Materialized view'
}

export function TableHeader({ details, activeTab, onChangeTab }: TableHeaderProps) {
  const Icon = details.type === 'table' ? IconTable : IconEye
  const isView = details.type !== 'table'
  return (
    <div className="shrink-0 border-b border-border px-5 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              isView ? 'bg-amber-500/10 text-amber-300' : 'bg-accent/10 text-accent'
            )}
          >
            <Icon size={14} />
          </div>
          <h2 className="truncate text-[18px] font-semibold tracking-tight text-text">
            {details.name}
          </h2>
          <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            {TYPE_LABEL[details.type]}
          </span>
        </div>

        <div className="flex shrink-0 gap-1 rounded-lg border border-border bg-surface-elevated/40 p-0.5">
          <TabButton active={activeTab === 'data'} onClick={() => onChangeTab('data')}>
            Data
          </TabButton>
          <TabButton active={activeTab === 'structure'} onClick={() => onChangeTab('structure')}>
            Structure
          </TabButton>
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-md px-3 py-1 text-[12px] font-medium transition-colors',
        active
          ? 'bg-surface text-text shadow-sm'
          : 'text-text-muted hover:text-text'
      )}
    >
      {children}
    </button>
  )
}

import { IconTable, IconEye } from '@tabler/icons-react'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
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

        <SlidingTabs
          tabs={[
            { id: 'data', label: 'Data' },
            { id: 'structure', label: 'Structure' }
          ]}
          value={activeTab}
          onChange={onChangeTab}
        />
      </div>
    </div>
  )
}

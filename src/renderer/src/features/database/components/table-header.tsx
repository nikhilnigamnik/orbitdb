import { IconTable, IconEye } from '@tabler/icons-react'
import { Chip } from '@renderer/components/ui/chip'
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
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-linear-to-b ring-1 ring-inset',
              isView
                ? 'from-amber-500/20 to-amber-500/5 text-amber-200 ring-amber-500/25 shadow-[inset_0_1px_0_rgba(252,211,77,0.35)]'
                : 'from-sky-500/20 to-sky-500/5 text-sky-200 ring-sky-500/25 shadow-[inset_0_1px_0_rgba(125,211,252,0.35)]'
            )}
          >
            <Icon size={14} />
          </div>
          <h2 className="truncate text-[18px] font-semibold tracking-tight text-text">
            {details.name}
          </h2>
          <Chip tone={isView ? 'amber' : 'sky'}>{TYPE_LABEL[details.type]}</Chip>
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

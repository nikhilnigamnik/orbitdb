import { IconTable, IconEye } from '@tabler/icons-react'
import { formatNumber } from '@renderer/lib/format'
import type { TableDetails } from '@renderer/types'

interface TableHeaderProps {
  details: TableDetails
  activeTab: 'data' | 'structure'
  onChangeTab: (tab: 'data' | 'structure') => void
}

const TYPE_LABEL: Record<TableDetails['type'], string> = {
  table: 'Table',
  view: 'View',
  materialized_view: 'Mat. view'
}

export function TableHeader({ details, activeTab, onChangeTab }: TableHeaderProps) {
  const Icon = details.type === 'table' ? IconTable : IconEye
  return (
    <div className="flex items-end justify-between gap-4 border-b border-[var(--color-border)] px-6 pt-10 pb-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
            {TYPE_LABEL[details.type]}
          </span>
          <span className="text-[11px] text-[var(--color-text-subtle)]">·</span>
          <span className="text-[12px] text-[var(--color-text-muted)]">{details.schema}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <Icon size={15} className="text-[var(--color-text-muted)]" />
          <h2 className="truncate text-[17px] font-semibold tracking-tight text-[var(--color-text)]">
            {details.name}
          </h2>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--color-text-subtle)]">
          {details.estimatedRows != null && (
            <span>~{formatNumber(details.estimatedRows)} rows</span>
          )}
          <span>{details.columns.length} columns</span>
          {details.indexes.length > 0 && <span>{details.indexes.length} indexes</span>}
          {details.foreignKeys.length > 0 && <span>{details.foreignKeys.length} FKs</span>}
        </div>
      </div>
      <div className="flex gap-4 self-end">
        <TabButton active={activeTab === 'data'} onClick={() => onChangeTab('data')}>
          Data
        </TabButton>
        <TabButton active={activeTab === 'structure'} onClick={() => onChangeTab('structure')}>
          Structure
        </TabButton>
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
      onClick={onClick}
      className={`relative pb-1.5 text-[12.5px] font-medium transition-colors ${
        active
          ? 'text-[var(--color-text)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
      }`}
    >
      {children}
      <span
        className={`absolute -bottom-[13px] left-0 right-0 h-[2px] rounded-full transition-colors ${
          active ? 'bg-[var(--color-text)]' : 'bg-transparent'
        }`}
      />
    </button>
  )
}

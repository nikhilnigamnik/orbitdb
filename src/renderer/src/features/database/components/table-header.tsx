import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { formatNumber } from '@renderer/lib/format'
import type { TableDetails } from '@renderer/types'

interface TableHeaderProps {
  details: TableDetails
  activeTab: 'data' | 'structure'
  onChangeTab: (tab: 'data' | 'structure') => void
}

export function TableHeader({ details, activeTab, onChangeTab }: TableHeaderProps) {
  const columnCount = details.columns.length
  return (
    <div className="group/header shrink-0 border-b border-border px-5 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-xs font-semibold leading-tight tracking-tight text-text">
            {details.name}
          </h2>
          <div className="flex min-w-0 items-center gap-1.5 text-xs leading-tight text-text-subtle">
            <span className="font-mono text-text-muted">{details.schema}</span>
            <span className="text-text-subtle/50">·</span>
            <span>
              <span className="font-mono text-text-muted">{columnCount}</span> column
              {columnCount === 1 ? '' : 's'}
            </span>
            {details.estimatedRows != null && (
              <>
                <span className="text-text-subtle/50">·</span>
                <span>
                  <span className="font-mono text-text-muted">
                    ~{formatNumber(details.estimatedRows)}
                  </span>{' '}
                  rows
                </span>
              </>
            )}
          </div>
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

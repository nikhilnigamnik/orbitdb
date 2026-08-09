import { Chip } from '@renderer/components/ui/chip'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { formatNumber } from '@renderer/lib/format'
import type { TableDetails } from '@renderer/types'

interface TableHeaderProps {
  details: TableDetails
  activeTab: 'data' | 'structure'
  onChangeTab: (tab: 'data' | 'structure') => void
  /** Exact unfiltered row count, once known. Null while loading or skipped. */
  totalRows: number | null
}

const TYPE_LABEL: Record<TableDetails['type'], string | null> = {
  // A plain table is the default and needs no badge; the other two change what
  // the page can do — DDL controls do not render for them.
  table: null,
  view: 'View',
  materialized_view: 'Materialized view'
}

export function TableHeader({ details, activeTab, onChangeTab, totalRows }: TableHeaderProps) {
  const columnCount = details.columns.length
  const typeLabel = TYPE_LABEL[details.type]
  // Prefer the counted total. The estimate is a fallback for tables too large to
  // count, and only then is it marked approximate.
  const rowCount = totalRows ?? details.estimatedRows
  const isExact = totalRows != null

  return (
    <div className="shrink-0 border-b border-border px-5 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-xs font-semibold leading-tight tracking-tight text-text">
              {details.name}
            </h2>
            {typeLabel && <Chip>{typeLabel}</Chip>}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] leading-tight text-text-subtle">
            <span className="font-mono text-text-muted">{details.schema}</span>
            <span className="text-text-subtle/50">·</span>
            <span>
              <span className="font-mono text-text-muted">{columnCount}</span> column
              {columnCount === 1 ? '' : 's'}
            </span>
            {rowCount != null && (
              <>
                <span className="text-text-subtle/50">·</span>
                <span>
                  <span className="font-mono text-text-muted">
                    {isExact ? '' : '~'}
                    {formatNumber(rowCount)}
                  </span>{' '}
                  row{rowCount === 1 ? '' : 's'}
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

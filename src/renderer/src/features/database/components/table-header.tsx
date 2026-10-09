import { IconEye, IconSchema, IconTable } from '@tabler/icons-react'
import { PageHeader } from '@renderer/components/layout/page-header'
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
  /** Makes the schema crumb a link back to the connection overview. */
  onOpenSchema?: () => void
}

const TYPE_LABEL: Record<TableDetails['type'], string | null> = {
  // A plain table is the default and needs no badge; the other two change what
  // the page can do - DDL controls do not render for them.
  table: null,
  view: 'View',
  materialized_view: 'Materialized view'
}

/**
 * The page's top bar for a table: `schema > table` as the breadcrumb, the size
 * beside the title, and the Data / Structure switch on the right.
 */
export function TableHeader({
  details,
  activeTab,
  onChangeTab,
  totalRows,
  onOpenSchema
}: TableHeaderProps) {
  const columnCount = details.columns.length
  const typeLabel = TYPE_LABEL[details.type]
  // Prefer the counted total. The estimate is a fallback for tables too large to
  // count, and only then is it marked approximate.
  const rowCount = totalRows ?? details.estimatedRows
  const isExact = totalRows != null
  const TitleIcon = details.type === 'table' ? IconTable : IconEye

  return (
    <PageHeader
      breadcrumbs={[
        { label: details.schema, icon: <IconSchema />, onClick: onOpenSchema },
        { label: details.name, icon: <TitleIcon /> }
      ]}
      titleAdornment={
        <div className="flex items-center gap-2">
          {typeLabel && <Chip>{typeLabel}</Chip>}
          <div className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-text-subtle">
            <span>
              <span className="text-text-muted tabular-nums">{columnCount}</span> column
              {columnCount === 1 ? '' : 's'}
            </span>
            {rowCount != null && (
              <>
                <span className="text-text-subtle/60">·</span>
                <span>
                  <span className="text-text-muted tabular-nums">
                    {isExact ? '' : '~'}
                    {formatNumber(rowCount)}
                  </span>{' '}
                  row{rowCount === 1 ? '' : 's'}
                </span>
              </>
            )}
          </div>
        </div>
      }
      actions={
        <SlidingTabs
          tabs={[
            { id: 'data', label: 'Data' },
            { id: 'structure', label: 'Structure' }
          ]}
          value={activeTab}
          onChange={onChangeTab}
        />
      }
    />
  )
}

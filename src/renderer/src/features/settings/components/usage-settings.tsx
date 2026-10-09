import * as React from 'react'
import {
  IconChartBar,
  IconCpu,
  IconCurrencyDollar,
  IconHash,
  IconSparkles,
  IconTrash
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { useToast } from '@renderer/components/ui/toast'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { ErrorState } from '@renderer/components/common/error-state'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { formatNumber } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { errorMessage } from '@renderer/lib/errors'
import { unwrap } from '@renderer/lib/ipc'
import { AI_PROVIDERS, aiFeatureLabel, aiModelLabel, formatCost } from '@renderer/config/site'
import type { UsageBreakdown, UsageSummary, UsageWindow } from '@renderer/types'

import { SettingsCard } from './settings-card'

type Timeframe = 'today' | 'last30' | 'allTime'

/**
 * `usage.json` is a file on disk, not a type: a provider retired from the
 * registry, or a hand-edited row, must still render rather than throw and take
 * the whole settings page down with it.
 */
function providerLabel(id: string): string {
  return AI_PROVIDERS.find((provider) => provider.id === id)?.label ?? id
}

const TABS: { key: Timeframe; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'last30', label: '30 days' },
  { key: 'allTime', label: 'All time' }
]

export function UsageSettings() {
  const toast = useToast()
  const confirmClear = useDisclosure(false)
  const [summary, setSummary] = React.useState<UsageSummary | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [timeframe, setTimeframe] = React.useState<Timeframe>('last30')

  const load = React.useCallback(async () => {
    try {
      setSummary(await unwrap(window.api.usage.summary()))
      setLoadError(null)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function handleClear() {
    try {
      await unwrap(window.api.usage.clear())
      await load()
      confirmClear.close()
      toast.success('Usage history cleared')
    } catch (err) {
      toast.error('Could not clear usage', { description: errorMessage(err) })
    }
  }

  if (isLoading) {
    return (
      <SettingsCard>
        <div className="flex min-h-14 items-center gap-2.5 px-4 py-3 text-sm text-text-muted">
          <Spinner size={16} className="text-text-subtle" />
          Reading usage…
        </div>
      </SettingsCard>
    )
  }

  if (loadError && !summary) {
    return (
      <ErrorState
        title="Could not read AI usage"
        message={loadError}
        onRetry={() => {
          setIsLoading(true)
          void load()
        }}
      />
    )
  }

  const window_: UsageWindow = summary?.[timeframe] ?? {
    calls: 0,
    input: 0,
    output: 0,
    cost: 0,
    unpricedCalls: 0,
    byModel: [],
    byFeature: []
  }
  const hasAny = (summary?.allTime.calls ?? 0) > 0

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <SlidingTabs
            tabs={TABS.map((tab) => ({ id: tab.key, label: tab.label }))}
            value={timeframe}
            onChange={setTimeframe}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={confirmClear.open}
            disabled={!hasAny}
            className="shrink-0"
          >
            <IconTrash size={14} />
            Clear
          </Button>
        </div>

        {!hasAny ? (
          <SettingsCard>
            <UsageEmpty
              title="No AI usage yet"
              description="Run an AI feature and the calls will show up here."
            />
          </SettingsCard>
        ) : window_.calls === 0 ? (
          <SettingsCard>
            <UsageEmpty
              title="Nothing in this period"
              description="Pick a wider timeframe to see earlier calls."
            />
          </SettingsCard>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Calls" value={formatNumber(window_.calls)} />
              <StatTile label="Input tokens" value={formatNumber(window_.input)} />
              <StatTile label="Output tokens" value={formatNumber(window_.output)} />
              <StatTile
                label="Estimated cost"
                value={`~${formatCost(window_.cost)}`}
                title="Estimated at published list prices"
              />
            </div>
            <UsageTable
              heading="Model"
              icon={<IconCpu size={14} />}
              rows={window_.byModel}
              nameOf={(row) => (
                <span className="flex items-baseline gap-1.5" title={row.model}>
                  <span className="font-medium">{aiModelLabel(row.provider, row.model)}</span>
                  <span className="text-[12px] text-text-subtle">
                    {providerLabel(row.provider)}
                  </span>
                </span>
              )}
            />
            <UsageTable
              heading="Feature"
              icon={<IconSparkles size={14} />}
              rows={window_.byFeature}
              nameOf={(row) => <span className="font-medium">{aiFeatureLabel(row.feature)}</span>}
            />
          </>
        )}

        <p className="text-xs text-text-muted">
          Counted on this machine, kept for {summary?.retentionDays ?? 90} days. Costs are estimates
          at list prices.
          {window_.unpricedCalls > 0 && (
            <>
              {' '}
              {formatNumber(window_.unpricedCalls)}{' '}
              {window_.unpricedCalls === 1 ? 'call is' : 'calls are'} on a model with no rate here,
              so the total is short by that much.
            </>
          )}
        </p>
      </div>

      <ConfirmDialog
        isOpen={confirmClear.isOpen}
        onClose={confirmClear.close}
        title="Clear usage history?"
        description="The counts are only kept here, so this cannot be undone. Nothing else is affected."
        confirmLabel="Clear"
        variant="danger"
        onConfirm={handleClear}
      />
    </>
  )
}

/** One figure for the selected timeframe. Labelled as a group so it reads as a pair. */
function StatTile({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      title={title}
      className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3 shadow-card"
    >
      <span className="text-[12px] font-medium text-text-subtle">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-text">{value}</span>
    </div>
  )
}

function UsageEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-surface-elevated text-text-subtle">
        <IconChartBar size={20} />
      </span>
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-text-muted">{description}</p>
    </div>
  )
}

const NUMERIC_COLUMNS = [
  { label: 'Calls', icon: <IconHash size={14} /> },
  { label: 'Input', icon: <IconHash size={14} /> },
  { label: 'Output', icon: <IconHash size={14} /> },
  { label: 'Cost', icon: <IconCurrencyDollar size={14} /> }
]

function UsageTable({
  heading,
  icon,
  rows,
  nameOf
}: {
  heading: string
  icon: React.ReactNode
  rows: UsageBreakdown[]
  nameOf: (row: UsageBreakdown) => React.ReactNode
}) {
  if (rows.length === 0) return null
  // A real table, so digits line up down the column. Dot-separated numbers in one
  // string cannot be compared by eye, which is the only thing this table is for.
  const cell = 'h-9 border-r border-b border-border px-3 last:border-r-0'
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col />
          <col className="w-20" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="text-xs font-medium text-text-muted">
            <th className={cn(cell, 'text-left font-medium')}>
              <span className="flex items-center gap-1.5">
                <span className="text-text-subtle">{icon}</span>
                {heading}
              </span>
            </th>
            {NUMERIC_COLUMNS.map((column) => (
              <th key={column.label} className={cn(cell, 'text-right font-medium')}>
                <span className="flex items-center justify-end gap-1.5">
                  <span className="text-text-subtle">{column.icon}</span>
                  {column.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-b-0">
          {rows.map((row) => (
            <tr
              key={`${row.provider}|${row.model}|${row.feature}`}
              className="text-sm text-text transition-colors hover:bg-surface-elevated/60"
            >
              <td className={cn(cell, 'min-w-0 truncate')}>{nameOf(row)}</td>
              {[row.calls, row.input, row.output].map((value, i) => (
                <td key={i} className={cn(cell, 'text-right tabular-nums')}>
                  {formatNumber(value)}
                </td>
              ))}
              <td className={cn(cell, 'text-right tabular-nums')}>{formatCost(row.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

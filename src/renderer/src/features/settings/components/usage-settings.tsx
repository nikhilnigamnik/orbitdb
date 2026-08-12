import * as React from 'react'
import { IconChartBar, IconTrash } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { useToast } from '@renderer/components/ui/toast'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { formatNumber } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { errorMessage } from '@renderer/lib/errors'
import { unwrap } from '@renderer/lib/ipc'
import { aiFeatureLabel, aiModelLabel, aiProvider, formatCost } from '@renderer/config/site'
import type { AiProviderId, UsageBreakdown, UsageSummary, UsageWindow } from '@renderer/types'
import { SettingFooter, SettingsCard } from './settings-card'

type Timeframe = 'today' | 'last30' | 'allTime'

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
  const [timeframe, setTimeframe] = React.useState<Timeframe>('last30')

  const load = React.useCallback(async () => {
    try {
      setSummary(await unwrap(window.api.usage.summary()))
    } catch (err) {
      console.error('Failed to read usage', errorMessage(err))
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
        <div className="flex items-center gap-2.5 p-4 text-xs text-text-muted">
          <Spinner size={13} className="text-text-subtle" />
          Reading usage…
        </div>
      </SettingsCard>
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
      <SettingsCard>
        <div className="flex items-center justify-between gap-3 p-4">
          <SlidingTabs
            tabs={TABS.map((tab) => ({ id: tab.key, label: tab.label }))}
            value={timeframe}
            onChange={setTimeframe}
          />
          {window_.calls > 0 && (
            <span className="shrink-0 text-xs text-text-subtle">
              {formatNumber(window_.calls)} {window_.calls === 1 ? 'call' : 'calls'} ·{' '}
              <span className="font-mono text-text-muted">
                {formatNumber(window_.input + window_.output)}
              </span>{' '}
              tokens ·{' '}
              <span className="font-mono text-text" title="Estimated at published list prices">
                ~{formatCost(window_.cost)}
              </span>
            </span>
          )}
        </div>

        {!hasAny ? (
          <UsageEmpty
            title="No AI usage yet"
            description="Run an AI feature and the calls will show up here."
          />
        ) : window_.calls === 0 ? (
          <UsageEmpty
            title="Nothing in this period"
            description="Pick a wider timeframe to see earlier calls."
          />
        ) : (
          <>
            <UsageTable
              heading="By model"
              rows={window_.byModel}
              nameOf={(row) => (
                <span className="flex items-baseline gap-1.5" title={row.model}>
                  <span>{aiModelLabel(row.provider, row.model)}</span>
                  <span className="text-text-subtle">
                    {aiProvider(row.provider as AiProviderId).label}
                  </span>
                </span>
              )}
            />
            <UsageTable
              heading="By feature"
              rows={window_.byFeature}
              nameOf={(row) => aiFeatureLabel(row.feature)}
            />
          </>
        )}

        <SettingFooter>
          <span className="min-w-0 text-xs text-balance text-text-subtle">
            Counted on this machine, kept for {summary?.retentionDays ?? 90} days. Costs are
            estimates at list prices.
            {window_.unpricedCalls > 0 && (
              <>
                {' '}
                {formatNumber(window_.unpricedCalls)}{' '}
                {window_.unpricedCalls === 1 ? 'call is' : 'calls are'} on a model with no rate
                here, so the total is short by that much.
              </>
            )}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={confirmClear.open}
            disabled={!hasAny}
            className="shrink-0 text-text-muted hover:bg-surface-elevated hover:text-text"
          >
            <IconTrash size={12} />
            Clear
          </Button>
        </SettingFooter>
      </SettingsCard>

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

/** Sits inside SettingsCard, whose divide-y already draws the rule above it. */
function UsageEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <IconChartBar size={18} className="mb-1 text-text-subtle/60" />
      <p className="text-xs font-medium text-text">{title}</p>
      <p className="max-w-xs text-xs text-text-subtle">{description}</p>
    </div>
  )
}

function UsageTable({
  heading,
  rows,
  nameOf
}: {
  heading: string
  rows: UsageBreakdown[]
  nameOf: (row: UsageBreakdown) => React.ReactNode
}) {
  if (rows.length === 0) return null
  // A real grid, so digits line up down the column. Dot-separated numbers in one
  // string cannot be compared by eye, which is the only thing this table is for.
  const columns = 'grid grid-cols-[1fr_4rem_5rem_5rem_5rem] items-center gap-x-3 px-4'
  return (
    <div>
      <div className={cn(columns, 'pt-3 pb-1.5')}>
        <span className="text-xs font-medium text-text">{heading}</span>
        {['Calls', 'Input', 'Output', 'Cost'].map((label) => (
          <span
            key={label}
            className="text-right text-[10px] tracking-wide text-text-subtle uppercase"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((row) => (
          <div
            key={`${row.provider}|${row.model}|${row.feature}`}
            className={cn(columns, 'py-2 text-xs')}
          >
            <span className="min-w-0 truncate text-text-muted">{nameOf(row)}</span>
            {[row.calls, row.input, row.output].map((value, i) => (
              <span key={i} className="text-right font-mono tabular-nums text-text-subtle">
                {formatNumber(value)}
              </span>
            ))}
            <span className="text-right font-mono tabular-nums text-text-muted">
              {formatCost(row.cost)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

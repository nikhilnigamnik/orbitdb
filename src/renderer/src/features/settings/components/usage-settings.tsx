import * as React from 'react'
import { IconTrash } from '@tabler/icons-react'
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
import { aiFeatureLabel, aiModelLabel, aiProvider } from '@renderer/config/site'
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
          <span className="text-xs text-text-subtle">
            {formatNumber(window_.calls)} {window_.calls === 1 ? 'call' : 'calls'} ·{' '}
            <span className="font-mono text-text-muted">
              {formatNumber(window_.input + window_.output)}
            </span>{' '}
            tokens
          </span>
        </div>

        {!hasAny ? (
          <p className="px-4 pb-4 text-xs text-text-subtle">
            Nothing recorded yet — run an AI feature and it will show up here.
          </p>
        ) : window_.calls === 0 ? (
          <p className="px-4 pb-4 text-xs text-text-subtle">
            Nothing in this period. Try a wider one.
          </p>
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
          <span className="text-xs text-text-subtle">
            Counted on this machine, kept for {summary?.retentionDays ?? 90} days.
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={confirmClear.open}
            disabled={!hasAny}
            className="text-text-muted hover:bg-surface-elevated hover:text-text"
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
  const columns = 'grid grid-cols-[1fr_4.5rem_5.5rem_5.5rem] items-center gap-x-3 px-4'
  return (
    <div className="border-t border-border">
      <div className={cn(columns, 'pt-3 pb-1.5')}>
        <span className="text-xs font-medium text-text">{heading}</span>
        {['Calls', 'Input', 'Output'].map((label) => (
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
          </div>
        ))}
      </div>
    </div>
  )
}

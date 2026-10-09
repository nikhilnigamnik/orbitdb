import { Chip } from '@renderer/components/ui/chip'
import { shortServerVersion } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import type { TestConnectionResult } from '@renderer/types'

interface ConnectionTestResultProps {
  result: TestConnectionResult
}

export function ConnectionTestResult({ result }: ConnectionTestResultProps) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <Chip tone={result.success ? 'emerald' : 'rose'}>
          <span
            aria-hidden
            className={cn('size-1.5 rounded-full', result.success ? 'bg-success' : 'bg-danger')}
          />
          {result.success ? 'Connected' : 'Failed'}
        </Chip>
        {result.serverVersion && (
          <span className="truncate rounded-md border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[12px] text-text-muted">
            {shortServerVersion(result.serverVersion)}
          </span>
        )}
      </div>
      {!result.success && result.error && (
        <p className="mt-2 font-mono text-xs break-all text-danger">{result.error}</p>
      )}
    </div>
  )
}

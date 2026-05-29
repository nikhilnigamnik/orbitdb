import * as React from 'react'
import { IconCheck, IconCopy, IconTextWrap } from '@tabler/icons-react'
import { Sheet } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { cn } from '@renderer/lib/utils'

interface CellValueSheetProps {
  isOpen: boolean
  onClose: () => void
  value: unknown
  display: string
  columnName?: string
}

type ViewMode = 'formatted' | 'raw'

function rawText(value: unknown, display: string): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return display
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return display
    }
  }
  return String(value)
}

/** Returns pretty-printed JSON when the value is (or parses as) JSON, else null. */
function tryFormatJson(value: unknown): string | null {
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return null
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const looksJson =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    if (!looksJson) return null
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
      return null
    }
  }
  return null
}

export function CellValueSheet({
  isOpen,
  onClose,
  value,
  display,
  columnName
}: CellValueSheetProps) {
  const [mode, setMode] = React.useState<ViewMode>('formatted')
  const [wrap, setWrap] = React.useState(true)
  const [copied, setCopied] = React.useState(false)
  const timeoutRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const raw = rawText(value, display)
  const formatted = React.useMemo(() => tryFormatJson(value), [value])
  const isJson = formatted != null

  React.useEffect(() => {
    if (isOpen) setMode(isJson ? 'formatted' : 'raw')
  }, [isOpen, isJson])

  const shown = mode === 'formatted' && formatted != null ? formatted : raw
  const lineCount = shown.split('\n').length

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown)
      setCopied(true)
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard can fail in unfocused windows / no permission — silently ignore
    }
  }

  return (
    <Sheet
      openSheet={isOpen}
      setOpenSheet={(open) => {
        if (!open) onClose()
      }}
      side="right"
      sheetContentClassName="sm:max-w-2xl"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-0.5 border-b border-border px-4 py-3 pr-12">
            <h2 className="truncate text-[13px] font-semibold text-text">
              {columnName ?? 'Value'}
            </h2>
            <p className="text-[11px] text-text-subtle">
              {isJson ? 'JSON' : 'Text'} · {raw.length.toLocaleString()} chars ·{' '}
              {lineCount.toLocaleString()} {lineCount === 1 ? 'line' : 'lines'}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              {isJson ? (
                <SlidingTabs
                  tabs={[
                    { id: 'formatted', label: 'Formatted' },
                    { id: 'raw', label: 'Raw' }
                  ]}
                  value={mode}
                  onChange={(id) => setMode(id as ViewMode)}
                />
              ) : (
                <Chip tone="neutral">Text</Chip>
              )}

              <button
                type="button"
                onClick={() => setWrap((w) => !w)}
                title={wrap ? 'Disable wrapping' : 'Wrap lines'}
                aria-pressed={wrap}
                className={cn(
                  'flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors',
                  wrap
                    ? 'border-border bg-surface-elevated text-text'
                    : 'border-transparent text-text-subtle hover:bg-surface-elevated hover:text-text'
                )}
              >
                <IconTextWrap size={13} />
                Wrap
              </button>
            </div>

            <pre
              className={cn(
                'min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface-elevated/40 px-3.5 py-3 font-mono text-[12px] leading-relaxed text-text',
                wrap ? 'whitespace-pre-wrap wrap-anywhere' : 'whitespace-pre'
              )}
            >
              {shown}
            </pre>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-elevated/20 px-4 py-3">
            <Button
              size="sm"
              variant="ghost"
              className="text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={copy}
            >
              {copied ? (
                <IconCheck size={12} className="text-emerald-400" />
              ) : (
                <IconCopy size={12} />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      }
    />
  )
}

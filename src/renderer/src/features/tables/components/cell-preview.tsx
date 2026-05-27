import * as React from 'react'
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { formatDistanceToNow } from 'date-fns'

interface CellPreviewProps {
  value: unknown
  display: string
  columnName?: string
  children: React.ReactNode
}

const DATE_COLUMN_NAMES = new Set([
  'date',
  'datetime',
  'timestamp',
  'created',
  'updated',
  'deleted',
  'expires',
  'expired',
  'published',
  'scheduled',
  'createdat',
  'updatedat',
  'deletedat',
  'expiresat',
  'publishedat',
  'scheduledat',
  'lastseen',
  'lastlogin',
  'lastloggedin'
])

function looksLikeDateColumn(name: string | undefined): boolean {
  if (!name) return false
  if (/_(at|date|time|timestamp)$/i.test(name)) return true
  if (/(At|Date|Time|Timestamp)$/.test(name)) return true
  return DATE_COLUMN_NAMES.has(name.toLowerCase())
}

function useClipboardCopy(): {
  copied: string | null
  copy: (key: string, text: string) => Promise<void>
} {
  const [copied, setCopied] = React.useState<string | null>(null)
  const timeoutRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const copy = React.useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setCopied(null), 1200)
    } catch {
      // clipboard can fail in unfocused windows / no permission — silently ignore
    }
  }, [])

  return { copied, copy }
}

const SHORT_THRESHOLD = 50
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

// Roughly year-2001 → year-2096 in milliseconds. Tight enough that random
// integer IDs typically fall outside this window.
const EPOCH_MS_MIN = 1e12
const EPOCH_MS_MAX = 4e12
// Same range expressed in seconds. Used only when the column name hints at
// a timestamp, since 1e9-4e9 IDs are common.
const EPOCH_S_MIN = 1e9
const EPOCH_S_MAX = 4e9

function epochMsToDate(n: number): Date | null {
  if (!Number.isFinite(n)) return null
  if (n < EPOCH_MS_MIN || n >= EPOCH_MS_MAX) return null
  const d = new Date(n)
  return Number.isFinite(d.getTime()) ? d : null
}

function epochSecondsToDate(n: number): Date | null {
  if (!Number.isFinite(n)) return null
  if (n < EPOCH_S_MIN || n >= EPOCH_S_MAX) return null
  const d = new Date(n * 1000)
  return Number.isFinite(d.getTime()) ? d : null
}

function numericToDate(n: number, columnHint: boolean): Date | null {
  return epochMsToDate(n) ?? (columnHint ? epochSecondsToDate(n) : null)
}

function parseAsDate(value: unknown, columnName?: string): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }
  const columnHint = looksLikeDateColumn(columnName)
  if (typeof value === 'number') {
    return numericToDate(value, columnHint)
  }
  if (typeof value === 'bigint') {
    return numericToDate(Number(value), columnHint)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^-?\d{13}$/.test(trimmed)) {
      const fromMs = epochMsToDate(Number(trimmed))
      if (fromMs) return fromMs
    }
    if (columnHint && /^-?\d{10}$/.test(trimmed)) {
      const fromSec = epochSecondsToDate(Number(trimmed))
      if (fromSec) return fromSec
    }
    if (!ISO_DATE_PATTERN.test(trimmed)) return null
    const d = new Date(trimmed)
    return Number.isFinite(d.getTime()) ? d : null
  }
  return null
}

function isPreviewWorthy(value: unknown, display: string, columnName?: string): boolean {
  if (value === null || value === undefined) return false
  if (parseAsDate(value, columnName)) return true
  if (typeof value === 'object') return true
  if (display.length > SHORT_THRESHOLD) return true
  if (display.includes('\n')) return true
  return false
}

function prettyValue(value: unknown, display: string): string {
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return display
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
      } catch {
        return value
      }
    }
    return value
  }
  return display
}

export function CellPreview({ value, display, columnName, children }: CellPreviewProps) {
  if (!isPreviewWorthy(value, display, columnName)) {
    return <>{children}</>
  }

  const dateValue = parseAsDate(value, columnName)

  return (
    <HoverCardPrimitive.Root openDelay={300} closeDelay={80}>
      <HoverCardPrimitive.Trigger asChild>
        <span className="inline-block max-w-full truncate align-middle">{children}</span>
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="animate-fade-in z-50 max-h-[60vh] max-w-xl overflow-auto rounded-lg border border-border bg-surface p-2 shadow-2xl shadow-black/50"
        >
          {dateValue ? (
            <DatePreviewBody date={dateValue} />
          ) : (
            <TextPreviewBody text={prettyValue(value, display)} />
          )}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  )
}

function DatePreviewBody({ date }: { date: Date }) {
  const { copied, copy } = useClipboardCopy()

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'
  const localFormatted = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  })
  const utcFormatted = date.toLocaleString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  })
  const relative = formatDistanceToNow(date, { addSuffix: true })
  const epochMs = date.getTime().toString()
  const isoString = date.toISOString()

  return (
    <div className="flex flex-col px-1 py-0.5 text-[12px]">
      <CopyableRow
        label={localTz}
        value={localFormatted}
        isCopied={copied === 'local'}
        onCopy={() => void copy('local', localFormatted)}
        mono
      />
      <CopyableRow
        label="UTC"
        value={utcFormatted}
        isCopied={copied === 'utc'}
        onCopy={() => void copy('utc', utcFormatted)}
        mono
      />
      <CopyableRow
        label="Relative"
        value={relative}
        isCopied={copied === 'relative'}
        onCopy={() => void copy('relative', relative)}
      />
      <CopyableRow
        label="Timestamp"
        value={epochMs}
        isCopied={copied === 'epoch'}
        onCopy={() => void copy('epoch', epochMs)}
        mono
      />
      <CopyableRow
        label="ISO"
        value={isoString}
        isCopied={copied === 'iso'}
        onCopy={() => void copy('iso', isoString)}
        mono
      />
    </div>
  )
}

function CopyableRow({
  label,
  value,
  isCopied,
  onCopy,
  mono = false
}: {
  label: string
  value: string
  isCopied: boolean
  onCopy: () => void
  mono?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      title="Click to copy"
      className="group/copy flex cursor-pointer items-center justify-between gap-4 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-elevated"
    >
      <span className="text-text-subtle">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`text-right text-text ${mono ? 'font-mono' : ''}`}>{value}</span>
        {isCopied ? (
          <IconCheck size={11} className="text-emerald-400" />
        ) : (
          <IconCopy
            size={11}
            className="text-text-subtle opacity-0 transition-opacity group-hover/copy:opacity-100"
          />
        )}
      </span>
    </button>
  )
}

function TextPreviewBody({ text }: { text: string }) {
  const { copied, copy } = useClipboardCopy()
  const isCopied = copied === 'text'

  return (
    <button
      type="button"
      onClick={() => void copy('text', text)}
      title="Click to copy"
      className="group/copy flex w-full cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-elevated"
    >
      <pre className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere font-mono text-[11px] leading-snug text-text-muted">
        {text}
      </pre>
      <span className="mt-0.5 shrink-0">
        {isCopied ? (
          <IconCheck size={11} className="text-emerald-400" />
        ) : (
          <IconCopy
            size={11}
            className="text-text-subtle opacity-0 transition-opacity group-hover/copy:opacity-100"
          />
        )}
      </span>
    </button>
  )
}

import * as React from 'react'
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { formatDistanceToNow } from 'date-fns'

interface CellPreviewProps {
  value: unknown
  display: string
  children: React.ReactNode
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

function parseAsDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }
  if (typeof value === 'string') {
    if (!ISO_DATE_PATTERN.test(value.trim())) return null
    const d = new Date(value)
    return Number.isFinite(d.getTime()) ? d : null
  }
  return null
}

function isPreviewWorthy(value: unknown, display: string): boolean {
  if (value === null || value === undefined) return false
  if (parseAsDate(value)) return true
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

export function CellPreview({ value, display, children }: CellPreviewProps) {
  if (!isPreviewWorthy(value, display)) {
    return <>{children}</>
  }

  const dateValue = parseAsDate(value)

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
          className="animate-fade-in z-50 max-h-[60vh] min-w-[16rem] max-w-[36rem] overflow-auto rounded-lg border border-border bg-surface p-2 shadow-2xl shadow-black/50"
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
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void copy('text', text)}
        title="Click to copy"
        className="absolute right-1 top-1 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded text-text-subtle opacity-0 transition-opacity hover:bg-surface-elevated hover:text-text [&:hover]:opacity-100 group-hover:opacity-100"
      >
        {copied === 'text' ? (
          <IconCheck size={11} className="text-emerald-400" />
        ) : (
          <IconCopy size={11} />
        )}
      </button>
      <pre
        onClick={() => void copy('text', text)}
        className="cursor-pointer whitespace-pre-wrap break-words rounded font-mono text-[11px] leading-snug text-text-muted transition-colors hover:bg-surface-elevated/40"
      >
        {text}
      </pre>
    </div>
  )
}

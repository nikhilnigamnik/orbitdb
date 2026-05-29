import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { IconPencil } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Select } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Chip } from '@renderer/components/ui/chip'
import { Kbd } from '@renderer/components/ui/kbd'
import type { ColumnInfo } from '@renderer/types'
import {
  coerceCellValue,
  isBoolType,
  isJsonType,
  isNumericType,
  stringifyValue
} from '../lib/cell-value'

interface CellEditPopoverProps {
  column: ColumnInfo
  value: unknown
  /** The cell content rendered as the popover anchor. */
  children: React.ReactNode
  onSave: (newValue: unknown) => Promise<void>
  onCancel: () => void
}

export function CellEditPopover({
  column,
  value,
  children,
  onSave,
  onCancel
}: CellEditPopoverProps) {
  const initial = React.useMemo(() => stringifyValue(value), [value])
  const [raw, setRaw] = React.useState(initial)
  const [isNull, setIsNull] = React.useState(value === null)
  const [error, setError] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)

  const isBool = isBoolType(column.udtName)
  const useTextarea = isJsonType(column.udtName) || initial.length > 60 || initial.includes('\n')
  const isDirty = isNull !== (value === null) || raw !== initial

  async function save() {
    setError(null)
    let coerced: unknown
    try {
      coerced = coerceCellValue(column, raw, isNull)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }
    setIsSaving(true)
    try {
      await onSave(coerced)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (!useTextarea || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void save()
    }
  }

  return (
    <PopoverPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onCancel()
      }}
    >
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="animate-slide-up-fade z-50 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-elevated/30 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-linear-to-b from-accent/25 to-accent/5 text-accent ring-1 ring-inset ring-accent/30 shadow-[inset_0_1px_0_rgba(125,152,248,0.4)]">
                <IconPencil size={11} stroke={2} />
              </div>
              <span className="truncate text-[12px] font-semibold text-text">{column.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-text-subtle">
                {column.dataType}
              </span>
            </div>
            {column.isPrimaryKey && <Chip tone="amber">PK</Chip>}
          </div>

          <div className="flex flex-col gap-2 px-3 py-3">
            <div onKeyDown={handleKeyDown}>
              {isBool ? (
                <Select
                  value={isNull ? '' : raw}
                  onChange={(v) => {
                    setRaw(v)
                    setIsNull(false)
                  }}
                  options={[
                    { value: 'true', label: 'true' },
                    { value: 'false', label: 'false' }
                  ]}
                  placeholder="—"
                  ariaLabel={column.name}
                  disabled={isNull}
                  className="h-8 w-full"
                />
              ) : useTextarea ? (
                <Textarea
                  autoFocus
                  value={raw}
                  onChange={(e) => {
                    setRaw(e.target.value)
                    setIsNull(false)
                  }}
                  disabled={isNull}
                  placeholder={isNull ? 'NULL' : ''}
                  className="min-h-28 font-mono text-xs"
                />
              ) : (
                <Input
                  autoFocus
                  type={isNumericType(column.udtName) ? 'number' : 'text'}
                  value={raw}
                  onChange={(e) => {
                    setRaw(e.target.value)
                    setIsNull(false)
                  }}
                  disabled={isNull}
                  placeholder={isNull ? 'NULL' : ''}
                />
              )}
            </div>

            {column.isNullable && (
              <label className="flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-text-muted">
                <Switch
                  checked={isNull}
                  onCheckedChange={(checked) => {
                    setIsNull(checked)
                    if (checked) setRaw('')
                  }}
                />
                Set NULL
              </label>
            )}

            {error && (
              <p className="rounded-md border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 text-[11px] leading-snug text-rose-200">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-elevated/20 px-3 py-2">
            <span className="flex items-center gap-1 text-[10px] text-text-subtle">
              <Kbd>{useTextarea ? '⌘ ↵' : '↵'}</Kbd>
              save
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="ghost"
                className="text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={onCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                className="bg-accent text-white hover:bg-accent/90"
                onClick={() => void save()}
                disabled={isSaving || !isDirty}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Switch } from '@renderer/components/ui/switch'
import { Select } from '@renderer/components/ui/select'
import { Chip } from '@renderer/components/ui/chip'
import { Kbd } from '@renderer/components/ui/kbd'
import type { ColumnInfo } from '@renderer/types'
import {
  boolishToString,
  coerceCellValue,
  editableEnumValues,
  isBoolType,
  isDateOnlyType,
  isJsonType,
  isNumericType,
  stringifyValue
} from '../lib/cell-value'

type CommitTarget = 'close' | 'next' | 'prev'

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

interface CellEditPopoverProps {
  column: ColumnInfo
  value: unknown
  /** The cell content rendered as the popover anchor. */
  children: React.ReactNode
  onSave: (newValue: unknown) => Promise<void>
  onClose: () => void
  /** Commits (when dirty) and moves editing to the adjacent cell. */
  onNavigate?: (direction: 'next' | 'prev') => void
}

export function CellEditPopover({
  column,
  value,
  children,
  onSave,
  onClose,
  onNavigate
}: CellEditPopoverProps) {
  const isBool = isBoolType(column.udtName)
  const isJson = isJsonType(column.udtName)
  const selectOptions = isBool ? ['true', 'false'] : editableEnumValues(column)
  const initial = React.useMemo(
    () => (isBool ? boolishToString(value) : stringifyValue(value, column.udtName)),
    [isBool, value, column.udtName]
  )
  const [raw, setRaw] = React.useState(initial)
  const [isNull, setIsNull] = React.useState(value === null)
  const [error, setError] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [hasCopied, setHasCopied] = React.useState(false)

  const useTextarea =
    selectOptions == null && (isJson || initial.length > 60 || initial.includes('\n'))
  // Decided once from the initial value so the input never flips between
  // type="text" and type="date" mid-edit.
  const useDateInput =
    isDateOnlyType(column.udtName) && (initial === '' || DATE_ONLY_RE.test(initial))
  const isDirty = isNull !== (value === null) || (!isNull && raw !== initial)

  const jsonError = React.useMemo(() => {
    if (!isJson || isNull || raw.trim() === '') return null
    try {
      JSON.parse(raw)
      return null
    } catch {
      return 'Invalid JSON'
    }
  }, [isJson, isNull, raw])

  const charLimit = !isJson && selectOptions == null ? column.characterMaximumLength : null
  const isOverLimit = charLimit != null && raw.length > charLimit

  const inputRef = React.useRef<HTMLInputElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    // After Radix's own open-autofocus: focus the editor with the caret at
    // the end, without selecting the value.
    const frame = requestAnimationFrame(() => {
      const el = inputRef.current ?? textareaRef.current
      if (!el) return
      el.focus()
      // setSelectionRange throws on input type="date"
      if (el.tagName === 'TEXTAREA' || (el as HTMLInputElement).type === 'text') {
        el.setSelectionRange(el.value.length, el.value.length)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  function setValue(next: string) {
    setRaw(next)
    if (isNull) setIsNull(false)
  }

  async function commit(target: CommitTarget) {
    if (isSaving) return
    const finish = () => {
      if (target !== 'close' && onNavigate) onNavigate(target)
      else onClose()
    }
    if (!isDirty) {
      finish()
      return
    }
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
      finish()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Enter/Tab while an IME composition is active confirms the candidate,
    // not the edit.
    if (e.nativeEvent.isComposing) return
    const target = e.target as HTMLElement
    const isInEditor = target.closest('[data-cell-editor]') != null
    if (e.key === 'Tab' && isInEditor) {
      e.preventDefault()
      void commit(e.shiftKey ? 'prev' : 'next')
      return
    }
    if (e.key === 'Enter') {
      if (target.closest('button') != null) return
      if (target.tagName === 'TEXTAREA' && !e.metaKey && !e.ctrlKey) return
      e.preventDefault()
      void commit('close')
    }
  }

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(stringifyValue(value, column.udtName))
      setHasCopied(true)
      window.setTimeout(() => setHasCopied(false), 1200)
    } catch {
      // clipboard unavailable — nothing to surface
    }
  }

  function prettifyJson() {
    try {
      setValue(JSON.stringify(JSON.parse(raw), null, 2))
    } catch {
      // leave invalid JSON untouched; the inline error already shows
    }
  }

  return (
    <PopoverPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose()
      }}
    >
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={12}
          onKeyDown={handleKeyDown}
          className={cn(
            'animate-slide-up-fade z-50 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/50',
            useTextarea && 'w-96'
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-elevated/30 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[12px] font-semibold text-text">{column.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-text-subtle">
                {column.dataType}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {column.isPrimaryKey && <Chip tone="amber">PK</Chip>}
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-text-subtle hover:bg-surface-elevated hover:text-text"
                onClick={() => void copyValue()}
                title="Copy value"
              >
                {hasCopied ? <IconCheck className="text-emerald-300" /> : <IconCopy />}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 px-3 py-3">
            <div data-cell-editor>
              {selectOptions != null ? (
                <Select
                  value={isNull ? '' : raw}
                  onChange={setValue}
                  options={selectOptions.map((option) => ({ value: option, label: option }))}
                  placeholder={isNull ? 'NULL' : 'Select value…'}
                  ariaLabel={column.name}
                  className="h-8 w-full font-mono text-xs"
                />
              ) : useTextarea ? (
                <Textarea
                  ref={textareaRef}
                  value={isNull ? '' : raw}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={isNull ? 'NULL' : ''}
                  aria-invalid={jsonError != null || undefined}
                  className={cn('min-h-32 font-mono text-xs', isJson && 'min-h-40')}
                />
              ) : (
                <Input
                  ref={inputRef}
                  type={useDateInput ? 'date' : 'text'}
                  inputMode={isNumericType(column.udtName) ? 'decimal' : undefined}
                  value={isNull ? '' : raw}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={isNull ? 'NULL' : ''}
                  aria-invalid={isOverLimit || undefined}
                  className="h-8 font-mono text-xs"
                />
              )}
            </div>

            {(column.isNullable || charLimit != null || (isJson && !isNull)) && (
              <div className="flex min-h-4 items-center justify-between gap-2">
                {column.isNullable ? (
                  <label className="flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-text-muted">
                    <Switch checked={isNull} onCheckedChange={setIsNull} />
                    Set <span className="font-mono text-[10px]">NULL</span>
                  </label>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  {isJson && !isNull && raw.trim() !== '' && (
                    <button
                      type="button"
                      onClick={prettifyJson}
                      disabled={jsonError != null}
                      className="cursor-pointer rounded px-1 py-0.5 text-[10px] text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Format
                    </button>
                  )}
                  {charLimit != null && (
                    <span
                      className={cn(
                        'font-mono text-[10px]',
                        isOverLimit ? 'text-rose-300' : 'text-text-subtle'
                      )}
                    >
                      {raw.length}/{charLimit}
                    </span>
                  )}
                </div>
              </div>
            )}

            {(error ?? jsonError) && (
              <p className="rounded-md border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 text-[11px] leading-snug text-rose-200">
                {error ?? jsonError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-elevated/20 px-3 py-2">
            <span className="flex items-center gap-2.5 text-[10px] text-text-subtle">
              <span className="flex items-center gap-1">
                <Kbd>{useTextarea ? '⌘ ↵' : '↵'}</Kbd>
                save
              </span>
              {onNavigate && (
                <span className="flex items-center gap-1">
                  <Kbd>⇥</Kbd>
                  next
                </span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="ghost"
                className="text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                className="bg-accent text-white hover:bg-accent/90"
                onClick={() => void commit('close')}
                disabled={isSaving || !isDirty || jsonError != null}
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

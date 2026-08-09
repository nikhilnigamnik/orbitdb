import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Select as SelectPrimitive } from 'radix-ui'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
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

function ErrorBubble({ children }: { children: React.ReactNode }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        side="bottom"
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="animate-slide-up-fade z-50 max-w-72 rounded-md border border-danger/20 bg-surface px-2 py-1.5 text-xs leading-snug text-danger shadow-lg shadow-black/40"
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

interface CellInlineEditorProps {
  column: ColumnInfo
  value: unknown
  onSave: (newValue: unknown) => Promise<void>
  onClose: () => void
  /** Commits (when dirty) and moves editing to the adjacent cell. */
  onNavigate?: (direction: 'next' | 'prev') => void
  /** Reports whether the value differs from the one the cell held. */
  onDirtyChange?: (isDirty: boolean) => void
}

/**
 * Edits a cell in place: the cell content becomes a bare input (or an
 * auto-opened select for bool/enum). Long text and JSON expand into a
 * frameless floating textarea since they can't fit the row height.
 */
export function CellInlineEditor({
  column,
  value,
  onSave,
  onClose,
  onNavigate,
  onDirtyChange
}: CellInlineEditorProps) {
  const isBool = isBoolType(column.udtName)
  const isJson = isJsonType(column.udtName)
  const selectOptions = isBool ? ['true', 'false'] : editableEnumValues(column)
  const initial = React.useMemo(
    () => (isBool ? boolishToString(value) : stringifyValue(value, column.udtName)),
    [isBool, value, column.udtName]
  )
  const [raw, setRaw] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  // Blur cancels the edit — except while a commit is in flight, where the
  // input may lose focus (unmount, select portal) without the user leaving.
  const isCommittingRef = React.useRef(false)
  // Radix fires the select's close after a rejected save has already cleared
  // isCommittingRef, which would dismiss the editor and the error with it. Once
  // a commit has been attempted, only an explicit finish() closes this editor.
  const hasAttemptedCommitRef = React.useRef(false)

  const useOverlay =
    selectOptions == null && (isJson || initial.length > 60 || initial.includes('\n'))
  // Decided once from the initial value so the input never flips between
  // type="text" and type="date" mid-edit.
  const useDateInput =
    isDateOnlyType(column.udtName) && (initial === '' || DATE_ONLY_RE.test(initial))

  const jsonError = React.useMemo(() => {
    if (!isJson || raw.trim() === '') return null
    try {
      JSON.parse(raw)
      return null
    } catch {
      return 'Invalid JSON'
    }
  }, [isJson, raw])

  const charLimit = !isJson && selectOptions == null ? column.characterMaximumLength : null
  const isOverLimit = charLimit != null && raw.length > charLimit

  // Tab on an untouched cell skips the write entirely; without a signal there is
  // no way to tell an edited cell from one merely opened.
  const isDirty = raw !== initial
  React.useEffect(() => {
    onDirtyChange?.(isDirty)
    return () => onDirtyChange?.(false)
  }, [isDirty, onDirtyChange])

  const inputRef = React.useRef<HTMLInputElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    // Focus the editor with the caret at the end, without selecting the value.
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
  // A failed save blurs focus into the void; bring the user back to the editor.
  React.useEffect(() => {
    if (error) (inputRef.current ?? textareaRef.current)?.focus()
  }, [error])

  const commit = React.useCallback(
    async (target: CommitTarget, next?: { raw?: string; toNull?: boolean }) => {
      if (isSaving) return
      const effectiveRaw = next?.raw ?? raw
      const toNull = next?.toNull ?? false
      const finish = (): void => {
        if (target !== 'close' && onNavigate) onNavigate(target)
        else onClose()
      }
      const isDirty = toNull ? value !== null : effectiveRaw !== initial
      if (!isDirty) {
        isCommittingRef.current = true
        finish()
        return
      }
      setError(null)
      let coerced: unknown
      try {
        coerced = coerceCellValue(column, effectiveRaw, toNull)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return
      }
      isCommittingRef.current = true
      hasAttemptedCommitRef.current = true
      setIsSaving(true)
      try {
        await onSave(coerced)
        finish()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setIsSaving(false)
        isCommittingRef.current = false
      }
    },
    [column, initial, isSaving, onClose, onNavigate, onSave, raw, value]
  )

  function handleEditorKeyDown(e: React.KeyboardEvent, isTextarea: boolean) {
    // Enter/Tab while an IME composition is active confirms the candidate,
    // not the edit.
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      void commit(e.shiftKey ? 'prev' : 'next')
      return
    }
    if (e.key === 'Enter') {
      if (isTextarea && !e.metaKey && !e.ctrlKey) return
      e.preventDefault()
      void commit('close')
      return
    }
    if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey) && column.isNullable) {
      e.preventDefault()
      void commit('close', { toNull: true })
    }
  }

  function handleBlur() {
    if (!isCommittingRef.current) onClose()
  }

  if (selectOptions != null) {
    return (
      // Wrapped so a rejected write has somewhere to be shown — picking a value
      // dismisses the select, and without this the error had no anchor and the
      // save failed in silence.
      <PopoverPrimitive.Root open={error != null}>
        <PopoverPrimitive.Anchor asChild>
          <div className="flex w-full items-center">
            <SelectPrimitive.Root
              defaultOpen
              defaultValue={initial === '' ? undefined : initial}
              onValueChange={(v) => void commit('close', { raw: v })}
              onOpenChange={(open) => {
                if (open) return
                // The select reports its close before it reports the chosen value, so
                // decide after both have landed — otherwise picking a value looks like
                // dismissing the editor, and a rejected save closes with its error.
                queueMicrotask(() => {
                  if (!isCommittingRef.current && !hasAttemptedCommitRef.current) onClose()
                })
              }}
            >
              <SelectPrimitive.Trigger
                aria-label={column.name}
                className="flex w-full cursor-pointer items-center justify-between gap-1 bg-transparent font-mono text-xs text-text outline-none data-placeholder:italic data-placeholder:text-text-subtle"
              >
                <SelectPrimitive.Value placeholder="NULL" />
                <IconChevronDown size={11} className="shrink-0 text-text-subtle" />
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                  position="popper"
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  className="animate-slide-up-fade z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-none border border-border-strong bg-surface text-text shadow-2xl shadow-black/70"
                >
                  <SelectPrimitive.Viewport className="p-1">
                    {selectOptions.map((option) => (
                      <SelectPrimitive.Item
                        key={option}
                        value={option}
                        className="relative flex cursor-pointer items-center gap-2 rounded-none py-1.5 pr-7 pl-2 font-mono text-xs text-text-muted outline-none transition-colors select-none focus:bg-surface-elevated focus:text-text data-[state=checked]:text-text"
                      >
                        <SelectPrimitive.ItemText>{option}</SelectPrimitive.ItemText>
                        <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                          <IconCheck size={12} className="text-text" />
                        </SelectPrimitive.ItemIndicator>
                      </SelectPrimitive.Item>
                    ))}
                    {column.isNullable && (
                      <button
                        type="button"
                        onClick={() => void commit('close', { toNull: true })}
                        className="flex w-full cursor-pointer items-center rounded-none border-t border-border/60 py-1.5 pl-2 font-mono text-xs text-text-subtle italic transition-colors hover:bg-surface-elevated hover:text-text"
                      >
                        NULL
                      </button>
                    )}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>
          </div>
        </PopoverPrimitive.Anchor>
        {error != null && <ErrorBubble>{error}</ErrorBubble>}
      </PopoverPrimitive.Root>
    )
  }

  if (useOverlay) {
    const activeError = error ?? jsonError
    return (
      <PopoverPrimitive.Root
        open
        onOpenChange={(open) => {
          if (!open && !isSaving) onClose()
        }}
      >
        <PopoverPrimitive.Trigger asChild>
          <span className="block max-w-full truncate opacity-40">{initial}</span>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={12}
            className="animate-slide-up-fade z-50 w-96 overflow-hidden rounded-none border border-border-strong bg-surface shadow-2xl shadow-black/70"
          >
            <textarea
              ref={textareaRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => handleEditorKeyDown(e, true)}
              placeholder={value === null ? 'NULL' : ''}
              spellCheck={false}
              disabled={isSaving}
              className={cn(
                'block w-full resize-none bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-text outline-none placeholder:italic placeholder:text-text-subtle',
                isJson ? 'min-h-44' : 'min-h-32'
              )}
            />
            {activeError && (
              <p className="border-t border-danger/20 bg-danger/5 px-3 py-1.5 text-xs leading-snug text-danger">
                {activeError}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5 text-xs text-text-subtle">
              <span className="flex items-center gap-2.5">
                <span className="flex items-center gap-1">
                  <Kbd>⌘ ↵</Kbd>
                  save
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>esc</Kbd>
                  cancel
                </span>
              </span>
              <span className="flex items-center gap-2">
                {isJson && raw.trim() !== '' && (
                  <button
                    type="button"
                    disabled={jsonError != null}
                    onClick={() => setRaw(JSON.stringify(JSON.parse(raw), null, 2))}
                    className="cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Format
                  </button>
                )}
                {column.isNullable && (
                  <button
                    type="button"
                    onClick={() => void commit('close', { toNull: true })}
                    className="cursor-pointer rounded px-1 py-0.5 font-mono italic transition-colors hover:bg-surface-elevated hover:text-text"
                  >
                    NULL
                  </button>
                )}
                {charLimit != null && (
                  <span className={cn('font-mono', isOverLimit && 'text-danger')}>
                    {raw.length}/{charLimit}
                  </span>
                )}
              </span>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }

  return (
    <PopoverPrimitive.Root open={error != null}>
      <PopoverPrimitive.Anchor asChild>
        <div className="flex w-full items-center">
          <input
            ref={inputRef}
            type={useDateInput ? 'date' : 'text'}
            inputMode={isNumericType(column.udtName) ? 'decimal' : undefined}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => handleEditorKeyDown(e, false)}
            onBlur={handleBlur}
            placeholder={value === null ? 'NULL' : ''}
            spellCheck={false}
            disabled={isSaving}
            className={cn(
              'w-full bg-transparent p-0 font-mono text-xs text-text outline-none placeholder:italic placeholder:text-text-subtle disabled:opacity-60',
              isOverLimit && 'text-danger'
            )}
          />
        </div>
      </PopoverPrimitive.Anchor>
      {error != null && <ErrorBubble>{error}</ErrorBubble>}
    </PopoverPrimitive.Root>
  )
}

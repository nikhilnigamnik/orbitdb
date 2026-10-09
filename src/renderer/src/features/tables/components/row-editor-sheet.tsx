import * as React from 'react'
import { Sheet } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Switch } from '@renderer/components/ui/switch'
import { Select } from '@renderer/components/ui/select'
import { SubmitButton } from '@renderer/components/forms/submit-button'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { formatColumnType } from '@renderer/lib/column-type'
import type { ColumnInfo } from '@renderer/types'
import { Chip } from '@renderer/components/ui/chip'
import {
  coerceCellValue,
  editableEnumValues,
  isBoolType,
  isJsonType,
  isNumericType,
  stringifyValue
} from '../lib/cell-value'
import { ReferencedBy } from './referenced-by'

type Mode = 'insert' | 'edit'

interface RowEditorSheetProps {
  isOpen: boolean
  onClose: () => void
  mode: Mode
  columns: ColumnInfo[]
  initialValues?: Record<string, unknown> | null
  onSubmit: (values: Record<string, unknown>) => Promise<void>
  /** Identifies the row well enough to look up what references it. Edit mode only. */
  connectionId?: string
  schema?: string
  table?: string
}

interface FieldState {
  raw: string
  isNull: boolean
  touched: boolean
}

function buildInitialFields(
  columns: ColumnInfo[],
  values?: Record<string, unknown> | null
): Record<string, FieldState> {
  const out: Record<string, FieldState> = {}
  for (const col of columns) {
    const current = values?.[col.name]
    out[col.name] = {
      raw: current == null ? '' : stringifyValue(current, col.udtName),
      isNull: current === null && values != null,
      touched: false
    }
  }
  return out
}

export function RowEditorSheet({
  isOpen,
  onClose,
  mode,
  columns,
  initialValues,
  onSubmit,
  connectionId,
  schema,
  table
}: RowEditorSheetProps) {
  const [fields, setFields] = React.useState<Record<string, FieldState>>(() =>
    buildInitialFields(columns, initialValues)
  )
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const [isConfirmingDiscard, setIsConfirmingDiscard] = React.useState(false)

  React.useEffect(() => {
    if (isOpen) {
      setFields(buildInitialFields(columns, initialValues))
      setError(null)
      setIsConfirmingDiscard(false)
    }
  }, [isOpen, columns, initialValues])

  const isDirty = React.useMemo(
    () => Object.values(fields).some((field) => field.touched),
    [fields]
  )

  // Escape and a stray click outside are the easiest ways to close the sheet,
  // and the easiest ways to lose a half-typed row - so they ask first.
  function requestClose() {
    if (isSubmitting) return
    if (isDirty) {
      setIsConfirmingDiscard(true)
      return
    }
    onClose()
  }

  function update(name: string, patch: Partial<FieldState>) {
    setFields((prev) => ({ ...prev, [name]: { ...prev[name], ...patch, touched: true } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const values: Record<string, unknown> = {}
    try {
      for (const col of columns) {
        const field = fields[col.name]
        if (mode === 'insert' && !field.touched && col.defaultValue != null) continue
        if (mode === 'insert' && !field.touched && field.raw === '' && !field.isNull) continue
        const value = coerceCellValue(col, field.raw, field.isNull)
        values[col.name] = value
      }
      if (Object.keys(values).length === 0) {
        throw new Error('Nothing to submit')
      }
      setIsSubmitting(true)
      await onSubmit(values)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Sheet
        title={mode === 'insert' ? 'Insert row' : 'Edit row'}
        openSheet={isOpen}
        setOpenSheet={(open) => {
          if (!open) requestClose()
        }}
        side="right"
        sheetContentClassName="sm:max-w-xl"
        content={
          <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
            <div className="flex h-12 shrink-0 items-center border-b border-border px-4 pr-12">
              <h2 className="truncate text-sm font-semibold text-text">
                {mode === 'insert' ? 'Insert row' : 'Edit row'}
              </h2>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4">
              <p className="text-xs text-text-muted">
                {mode === 'insert'
                  ? 'Untouched columns will use their default values.'
                  : 'Edit the values and save changes.'}
              </p>

              <div className="flex flex-col gap-1">
                {columns.map((col) => {
                  const field = fields[col.name]
                  const useTextarea = isJsonType(col.udtName)
                  const inputType = isNumericType(col.udtName) ? 'number' : 'text'
                  const enumValues = editableEnumValues(col)
                  const hint = `${formatColumnType(col.dataType, col.udtName)}${col.isNullable ? ' • nullable' : ''}${col.defaultValue ? ` • default ${col.defaultValue}` : ''}`
                  return (
                    <div
                      key={col.name}
                      className="grid grid-cols-[140px_1fr] items-start gap-3 py-1"
                    >
                      <div className="flex min-h-7 min-w-0 items-center gap-1.5">
                        <label
                          htmlFor={`row-${col.name}`}
                          title={col.name}
                          className="truncate text-xs text-text-muted"
                        >
                          {col.name}
                        </label>
                        {col.isPrimaryKey && <Chip tone="emerald">PK</Chip>}
                      </div>

                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            {useTextarea ? (
                              <Textarea
                                id={`row-${col.name}`}
                                value={field.raw}
                                onChange={(e) =>
                                  update(col.name, { raw: e.target.value, isNull: false })
                                }
                                placeholder={field.isNull ? 'NULL' : (col.defaultValue ?? '')}
                                disabled={field.isNull}
                                className="font-mono text-xs"
                              />
                            ) : isBoolType(col.udtName) ? (
                              <Select
                                value={field.raw}
                                onChange={(value) =>
                                  update(col.name, { raw: value, isNull: false })
                                }
                                options={[
                                  { value: 'true', label: 'true' },
                                  { value: 'false', label: 'false' }
                                ]}
                                placeholder="-"
                                disabled={field.isNull}
                                ariaLabel={col.name}
                                className="w-full"
                              />
                            ) : enumValues != null ? (
                              <Select
                                value={field.raw}
                                onChange={(value) =>
                                  update(col.name, { raw: value, isNull: false })
                                }
                                options={enumValues.map((option) => ({
                                  value: option,
                                  label: option
                                }))}
                                placeholder={field.isNull ? 'NULL' : '-'}
                                disabled={field.isNull}
                                ariaLabel={col.name}
                                className="w-full"
                              />
                            ) : (
                              <Input
                                id={`row-${col.name}`}
                                type={inputType}
                                value={field.raw}
                                onChange={(e) =>
                                  update(col.name, { raw: e.target.value, isNull: false })
                                }
                                placeholder={field.isNull ? 'NULL' : (col.defaultValue ?? '')}
                                disabled={field.isNull}
                              />
                            )}
                          </div>
                          {col.isNullable && (
                            <label className="flex h-7 shrink-0 items-center gap-1.5 text-xs text-text-muted">
                              <Switch
                                aria-label={`${col.name} is NULL`}
                                checked={field.isNull}
                                onCheckedChange={(checked) =>
                                  update(col.name, { isNull: checked, raw: '' })
                                }
                              />
                              NULL
                            </label>
                          )}
                        </div>
                        <p className="truncate text-[12px] text-text-subtle" title={hint}>
                          {hint}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {error && (
                <p className="rounded-lg border border-danger/15 bg-danger/5 px-3 py-2.5 font-mono text-xs text-danger">
                  {error}
                </p>
              )}

              {/* Insert has no row yet, so nothing can reference it. */}
              {mode === 'edit' && connectionId && schema && table && initialValues && (
                <ReferencedBy
                  connectionId={connectionId}
                  schema={schema}
                  table={table}
                  row={initialValues}
                  onNavigate={onClose}
                />
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={requestClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <SubmitButton
                size="sm"
                onClick={handleSubmit}
                isSubmitting={isSubmitting}
                loadingText={mode === 'insert' ? 'Inserting…' : 'Updating…'}
              >
                {mode === 'insert' ? 'Insert' : 'Save changes'}
              </SubmitButton>
            </div>
          </form>
        }
      />
      <ConfirmDialog
        isOpen={isConfirmingDiscard}
        onClose={() => setIsConfirmingDiscard(false)}
        onConfirm={() => {
          setIsConfirmingDiscard(false)
          onClose()
        }}
        title="Discard unsaved changes?"
        description={
          mode === 'insert'
            ? 'The row has not been inserted. Closing now throws away what you entered.'
            : 'Your edits to this row have not been saved. Closing now throws them away.'
        }
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
      />
    </>
  )
}

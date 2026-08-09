import * as React from 'react'
import { Sheet } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Switch } from '@renderer/components/ui/switch'
import { Select } from '@renderer/components/ui/select'
import { FormField } from '@renderer/components/forms/form-field'
import { SubmitButton } from '@renderer/components/forms/submit-button'
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

type Mode = 'insert' | 'edit'

interface RowEditorSheetProps {
  isOpen: boolean
  onClose: () => void
  mode: Mode
  columns: ColumnInfo[]
  initialValues?: Record<string, unknown> | null
  onSubmit: (values: Record<string, unknown>) => Promise<void>
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
  onSubmit
}: RowEditorSheetProps) {
  const [fields, setFields] = React.useState<Record<string, FieldState>>(() =>
    buildInitialFields(columns, initialValues)
  )
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (isOpen) {
      setFields(buildInitialFields(columns, initialValues))
      setError(null)
    }
  }, [isOpen, columns, initialValues])

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
    <Sheet
      openSheet={isOpen}
      setOpenSheet={(open) => {
        if (!open) onClose()
      }}
      side="right"
      sheetContentClassName="sm:max-w-xl"
      content={
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-0.5 border-b border-border px-4 py-3 pr-12">
            <h2 className="text-xs font-semibold text-text">
              {mode === 'insert' ? 'Insert row' : 'Edit row'}
            </h2>
            <p className="text-xs text-text-subtle">
              {mode === 'insert'
                ? 'Untouched columns will use their default values.'
                : 'Edit the values and save changes.'}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-4">
            {columns.map((col) => {
              const field = fields[col.name]
              const useTextarea = isJsonType(col.udtName)
              const inputType = isNumericType(col.udtName) ? 'number' : 'text'
              const enumValues = editableEnumValues(col)
              return (
                <FormField
                  key={col.name}
                  label={col.name}
                  htmlFor={`row-${col.name}`}
                  hint={`${formatColumnType(col.dataType, col.udtName)}${col.isNullable ? ' • nullable' : ''}${col.defaultValue ? ` • default ${col.defaultValue}` : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      {useTextarea ? (
                        <Textarea
                          id={`row-${col.name}`}
                          value={field.raw}
                          onChange={(e) => update(col.name, { raw: e.target.value, isNull: false })}
                          placeholder={field.isNull ? 'NULL' : (col.defaultValue ?? '')}
                          disabled={field.isNull}
                          className="font-mono text-xs"
                        />
                      ) : isBoolType(col.udtName) ? (
                        <Select
                          value={field.raw}
                          onChange={(value) => update(col.name, { raw: value, isNull: false })}
                          options={[
                            { value: 'true', label: 'true' },
                            { value: 'false', label: 'false' }
                          ]}
                          placeholder="—"
                          disabled={field.isNull}
                          ariaLabel={col.name}
                          className="h-9 w-full"
                        />
                      ) : enumValues != null ? (
                        <Select
                          value={field.raw}
                          onChange={(value) => update(col.name, { raw: value, isNull: false })}
                          options={enumValues.map((option) => ({
                            value: option,
                            label: option
                          }))}
                          placeholder={field.isNull ? 'NULL' : '—'}
                          disabled={field.isNull}
                          ariaLabel={col.name}
                          className="h-9 w-full"
                        />
                      ) : (
                        <Input
                          id={`row-${col.name}`}
                          type={inputType}
                          value={field.raw}
                          onChange={(e) => update(col.name, { raw: e.target.value, isNull: false })}
                          placeholder={field.isNull ? 'NULL' : (col.defaultValue ?? '')}
                          disabled={field.isNull}
                        />
                      )}
                    </div>
                    {col.isNullable && (
                      <label className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                        <Switch
                          checked={field.isNull}
                          onCheckedChange={(checked) =>
                            update(col.name, { isNull: checked, raw: '' })
                          }
                        />
                        NULL
                      </label>
                    )}
                    {col.isPrimaryKey && <Chip tone="emerald">PK</Chip>}
                  </div>
                </FormField>
              )
            })}

            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 p-2 font-mono text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-elevated/20 px-4 py-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={onClose}
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
  )
}

import * as React from 'react'
import { Modal } from '@renderer/components/ui/modal'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { FormField } from '@renderer/components/forms/form-field'
import { SubmitButton } from '@renderer/components/forms/submit-button'
import { Badge } from '@renderer/components/ui/badge'
import type { ColumnInfo } from '@renderer/types'

type Mode = 'insert' | 'edit'

interface RowEditorModalProps {
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

function isJsonType(udt: string): boolean {
  return udt === 'json' || udt === 'jsonb'
}

function isBoolType(udt: string): boolean {
  return udt === 'bool'
}

function isNumericType(udt: string): boolean {
  return ['int2', 'int4', 'int8', 'numeric', 'float4', 'float8', 'money'].includes(udt)
}

function stringifyInitial(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function buildInitialFields(
  columns: ColumnInfo[],
  values?: Record<string, unknown> | null
): Record<string, FieldState> {
  const out: Record<string, FieldState> = {}
  for (const col of columns) {
    const current = values?.[col.name]
    out[col.name] = {
      raw: current == null ? '' : stringifyInitial(current),
      isNull: current === null && values != null,
      touched: false
    }
  }
  return out
}

function coerceValue(col: ColumnInfo, field: FieldState): unknown {
  if (field.isNull) return null
  const raw = field.raw
  if (isBoolType(col.udtName)) {
    if (raw === '' || raw == null) return null
    return raw === 'true' || raw === 't' || raw === '1'
  }
  if (isJsonType(col.udtName) && raw.trim() !== '') {
    try {
      return JSON.parse(raw)
    } catch {
      throw new Error(`Column "${col.name}": invalid JSON`)
    }
  }
  if (isNumericType(col.udtName) && raw.trim() !== '') {
    const num = Number(raw)
    if (Number.isNaN(num)) throw new Error(`Column "${col.name}": invalid number`)
    return num
  }
  return raw
}

export function RowEditorModal({
  isOpen,
  onClose,
  mode,
  columns,
  initialValues,
  onSubmit
}: RowEditorModalProps) {
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
        const value = coerceValue(col, field)
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'insert' ? 'Insert row' : 'Edit row'}
      size="lg"
      footer={
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <SubmitButton
            size="sm"
            className="bg-accent text-white hover:bg-accent/90"
            onClick={handleSubmit}
            isSubmitting={isSubmitting}
            loadingText={mode === 'insert' ? 'Inserting…' : 'Updating…'}
          >
            {mode === 'insert' ? 'Insert' : 'Save changes'}
          </SubmitButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="max-h-[60vh] space-y-3 overflow-auto pr-1">
        {columns.map((col) => {
          const field = fields[col.name]
          const useTextarea = isJsonType(col.udtName)
          const inputType = isNumericType(col.udtName) ? 'number' : 'text'
          return (
            <FormField
              key={col.name}
              label={col.name}
              htmlFor={`row-${col.name}`}
              hint={`${col.dataType}${col.isNullable ? ' • nullable' : ''}${col.defaultValue ? ` • default ${col.defaultValue}` : ''}`}
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
                    <select
                      id={`row-${col.name}`}
                      value={field.raw}
                      onChange={(e) => update(col.name, { raw: e.target.value, isNull: false })}
                      disabled={field.isNull}
                      className="h-9 w-full rounded-lg border border-neutral-800 bg-transparent px-2.5 text-sm text-neutral-100 outline-none focus-visible:border-neutral-500"
                    >
                      <option value="">—</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
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
                  <label className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
                    <Checkbox
                      checked={field.isNull}
                      onChange={(e) => update(col.name, { isNull: e.target.checked, raw: '' })}
                    />
                    NULL
                  </label>
                )}
                {col.isPrimaryKey && <Badge variant="info">PK</Badge>}
              </div>
            </FormField>
          )
        })}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 font-mono text-xs text-red-300/80">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

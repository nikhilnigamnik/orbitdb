import * as React from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Sheet } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { unwrap } from '@renderer/lib/ipc'
import type { ColumnInfo, DdlOperation, DdlOperationKind } from '@renderer/types'

interface DdlDialogProps {
  isOpen: boolean
  onClose: () => void
  connectionId: string
  schema: string
  table: string
  columns: ColumnInfo[]
  kind: DdlOperationKind
  /** Preselected column or index name for drop/rename operations. */
  target?: string
  onSuccess: (operation: DdlOperation) => void
}

const TITLES: Record<DdlOperationKind, string> = {
  'add-column': 'Add column',
  'drop-column': 'Drop column',
  'rename-column': 'Rename column',
  'rename-table': 'Rename table',
  'create-index': 'Create index',
  'drop-index': 'Drop index',
  'truncate-table': 'Truncate table',
  'drop-table': 'Drop table'
}

const DESTRUCTIVE = new Set<DdlOperationKind>([
  'drop-column',
  'drop-index',
  'truncate-table',
  'drop-table'
])

export function DdlDialog({
  isOpen,
  onClose,
  connectionId,
  schema,
  table,
  columns,
  kind,
  target,
  onSuccess
}: DdlDialogProps) {
  // add-column
  const [colName, setColName] = React.useState('')
  const [dataType, setDataType] = React.useState('')
  const [isNullable, setIsNullable] = React.useState(true)
  const [defaultValue, setDefaultValue] = React.useState('')
  // rename-column / rename-table
  const [renameTo, setRenameTo] = React.useState('')
  // create-index
  const [indexName, setIndexName] = React.useState('')
  const [indexColumns, setIndexColumns] = React.useState<string[]>([])
  const [isUnique, setIsUnique] = React.useState(false)

  const [sql, setSql] = React.useState('')
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const [execError, setExecError] = React.useState<string | null>(null)
  const [isExecuting, setIsExecuting] = React.useState(false)

  // Reset the form whenever the dialog (re)opens for a specific operation.
  React.useEffect(() => {
    if (!isOpen) return
    setColName('')
    setDataType('')
    setIsNullable(true)
    setDefaultValue('')
    setRenameTo(kind === 'rename-table' ? table : '')
    setIndexName('')
    setIndexColumns(target ? [target] : [])
    setIsUnique(false)
    setSql('')
    setPreviewError(null)
    setExecError(null)
    setIsExecuting(false)
  }, [isOpen, kind, target, table])

  const operation = React.useMemo<DdlOperation | null>(() => {
    switch (kind) {
      case 'add-column':
        if (!colName.trim() || !dataType.trim()) return null
        return {
          kind,
          name: colName.trim(),
          dataType: dataType.trim(),
          isNullable,
          defaultValue: defaultValue.trim() || null
        }
      case 'drop-column':
        if (!target) return null
        return { kind, name: target }
      case 'rename-column':
        if (!target || !renameTo.trim()) return null
        return { kind, from: target, to: renameTo.trim() }
      case 'rename-table':
        if (!renameTo.trim() || renameTo.trim() === table) return null
        return { kind, to: renameTo.trim() }
      case 'create-index':
        if (!indexName.trim() || indexColumns.length === 0) return null
        return { kind, name: indexName.trim(), columns: indexColumns, isUnique }
      case 'drop-index':
        if (!target) return null
        return { kind, name: target }
      default:
        return null
    }
  }, [
    kind,
    target,
    colName,
    dataType,
    isNullable,
    defaultValue,
    renameTo,
    table,
    indexName,
    indexColumns,
    isUnique
  ])

  // Live-preview the generated SQL from the main process so the user always
  // sees exactly what will run, with engine-correct quoting.
  React.useEffect(() => {
    if (!isOpen || !operation) {
      setSql('')
      setPreviewError(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const generated = await unwrap(
          window.api.db.ddlPreview({ connectionId, schema, table, operation })
        )
        if (!cancelled) {
          setSql(generated)
          setPreviewError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setSql('')
          setPreviewError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, operation, connectionId, schema, table])

  async function handleConfirm() {
    if (!operation) return
    setIsExecuting(true)
    setExecError(null)
    try {
      await unwrap(window.api.db.ddlExecute({ connectionId, schema, table, operation }))
      onSuccess(operation)
      onClose()
    } catch (err) {
      setExecError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsExecuting(false)
    }
  }

  const isDestructive = DESTRUCTIVE.has(kind)

  function toggleIndexColumn(name: string, checked: boolean) {
    setIndexColumns((prev) => (checked ? [...prev, name] : prev.filter((c) => c !== name)))
  }

  return (
    <Sheet
      openSheet={isOpen}
      setOpenSheet={(open) => {
        if (!open && !isExecuting) onClose()
      }}
      side="right"
      sheetContentClassName="sm:max-w-md"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-0.5 border-b border-border px-4 py-3 pr-12">
            <h2 className="text-xs font-semibold text-text">{TITLES[kind]}</h2>
            <p className="text-xs text-text-subtle">
              {schema}.{table}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-4 py-4">
            {kind === 'add-column' && (
              <div className="flex flex-col gap-4">
                <Field label="Column name">
                  <Input
                    value={colName}
                    onChange={(e) => setColName(e.target.value)}
                    placeholder="e.g. status"
                    autoFocus
                  />
                </Field>
                <Field
                  label="Data type"
                  hint="Raw SQL type — e.g. text, varchar(255), integer, boolean"
                >
                  <Input
                    value={dataType}
                    onChange={(e) => setDataType(e.target.value)}
                    placeholder="e.g. text"
                    className="font-mono"
                  />
                </Field>
                <Field
                  label="Default value"
                  hint="Optional raw expression — e.g. 0, 'active', now()"
                >
                  <Input
                    value={defaultValue}
                    onChange={(e) => setDefaultValue(e.target.value)}
                    placeholder="leave empty for none"
                    className="font-mono"
                  />
                </Field>
                <ToggleRow
                  label="Nullable"
                  hint="Allow NULL values in this column"
                  checked={isNullable}
                  onChange={setIsNullable}
                />
              </div>
            )}

            {kind === 'rename-column' && (
              <Field label="New column name" hint={`Renaming "${target}"`}>
                <Input
                  value={renameTo}
                  onChange={(e) => setRenameTo(e.target.value)}
                  placeholder="new name"
                  autoFocus
                />
              </Field>
            )}

            {kind === 'rename-table' && (
              <Field label="New table name">
                <Input
                  value={renameTo}
                  onChange={(e) => setRenameTo(e.target.value)}
                  placeholder="new name"
                  autoFocus
                />
              </Field>
            )}

            {kind === 'create-index' && (
              <div className="flex flex-col gap-4">
                <Field label="Index name">
                  <Input
                    value={indexName}
                    onChange={(e) => setIndexName(e.target.value)}
                    placeholder={`e.g. idx_${table}_col`}
                    autoFocus
                  />
                </Field>
                <Field label="Columns" hint="Pick one or more, in index order">
                  <div className="flex max-h-48 flex-col gap-0.5 overflow-auto rounded-md border border-border p-1">
                    {columns.map((col) => {
                      const checked = indexColumns.includes(col.name)
                      return (
                        <label
                          key={col.name}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-elevated"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => toggleIndexColumn(col.name, !!v)}
                          />
                          <span className="font-medium text-text">{col.name}</span>
                          <span className="font-mono text-xs text-text-subtle">{col.dataType}</span>
                        </label>
                      )
                    })}
                  </div>
                </Field>
                <ToggleRow
                  label="Unique"
                  hint="Enforce uniqueness across the indexed columns"
                  checked={isUnique}
                  onChange={setIsUnique}
                />
              </div>
            )}

            {isDestructive && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-xs text-danger">
                <IconAlertTriangle size={15} className="mt-px shrink-0" stroke={2} />
                <span>
                  {kind === 'drop-column'
                    ? `Dropping column "${target}" permanently removes its data.`
                    : `Dropping index "${target}" cannot be undone from here.`}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Generated SQL
              </span>
              {previewError ? (
                <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                  {previewError}
                </p>
              ) : (
                <pre className="min-h-14 overflow-auto rounded-lg border border-border bg-surface-sunken px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere text-text">
                  {sql || (
                    <span className="text-text-subtle">
                      Fill in the fields to preview the statement.
                    </span>
                  )}
                </pre>
              )}
            </div>

            {execError && (
              <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                {execError}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-elevated/20 px-4 py-3">
            <Button
              size="sm"
              variant="ghost"
              className="text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={onClose}
              disabled={isExecuting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className={
                isDestructive
                  ? 'bg-danger-fill text-white shadow-[inset_0_-2px_0_0_var(--color-danger-shade),0_1px_3px_0_rgba(0,0,0,0.4)] hover:bg-danger hover:shadow-none active:shadow-none'
                  : ''
              }
              onClick={handleConfirm}
              disabled={!operation || !sql || isExecuting}
            >
              {isExecuting ? 'Running…' : isDestructive ? 'Run & drop' : 'Run statement'}
            </Button>
          </div>
        </div>
      }
    />
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-subtle">{hint}</span>}
    </label>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span className="text-xs font-medium text-text">{label}</span>
        {hint && <span className="text-xs text-text-subtle">{hint}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

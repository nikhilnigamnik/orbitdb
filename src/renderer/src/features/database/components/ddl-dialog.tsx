import * as React from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Dialog } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { useDebounce } from '@renderer/hooks/use-debounce'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import type { ColumnInfo, DdlFormKind, DdlOperation } from '@renderer/types'

interface DdlDialogProps {
  isOpen: boolean
  onClose: () => void
  connectionId: string
  schema: string
  table: string
  columns: ColumnInfo[]
  kind: DdlFormKind
  /** Preselected column or index name for drop/rename operations. */
  target?: string
  onSuccess: (operation: DdlOperation) => void
}

const TITLES: Record<DdlFormKind, string> = {
  'add-column': 'Add column',
  'drop-column': 'Drop column',
  'rename-column': 'Rename column',
  'rename-table': 'Rename table',
  'create-index': 'Create index',
  'drop-index': 'Drop index'
}

// Both take a target, which the warning copy below relies on.
const DESTRUCTIVE = new Set<DdlFormKind>(['drop-column', 'drop-index'])

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
  // sees exactly what will run, with engine-correct quoting. Held back so
  // typing a column name is not one IPC round-trip per keystroke.
  const previewOperation = useDebounce(operation, 150)
  React.useEffect(() => {
    if (!isOpen || !previewOperation) {
      setSql('')
      setPreviewError(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const generated = await unwrap(
          window.api.db.ddlPreview({ connectionId, schema, table, operation: previewOperation })
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
  }, [isOpen, previewOperation, connectionId, schema, table])

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

  // Every engine rejects adding a NOT NULL column with no default to a table
  // that already has rows. The form knows both facts; the database finding out
  // first means the attempt fails after the fact.
  const needsDefault =
    kind === 'add-column' && !isNullable && defaultValue.trim() === '' && colName.trim() !== ''

  function toggleIndexColumn(name: string, checked: boolean) {
    setIndexColumns((prev) => (checked ? [...prev, name] : prev.filter((c) => c !== name)))
  }

  return (
    <Dialog
      title={TITLES[kind]}
      open={isOpen}
      setOpen={(open) => {
        if (!open && !isExecuting) onClose()
      }}
      className="flex max-h-[76vh] w-[min(520px,calc(100vw-2rem))] flex-col"
      content={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-0.5 px-5 pt-5 pb-3">
            <h2 className="text-[15px] font-semibold text-text">{TITLES[kind]}</h2>
            <p className="truncate text-xs text-text-muted">
              {schema}.{table}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pt-1 pb-5">
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
                  hint="Raw SQL type - e.g. text, varchar(255), integer, boolean"
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
                  hint="Optional raw expression - e.g. 0, 'active', now()"
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
                  <div className="flex max-h-48 flex-col overflow-auto rounded-lg bg-control p-1 shadow-control">
                    {columns.map((col) => {
                      const checked = indexColumns.includes(col.name)
                      return (
                        <label
                          key={col.name}
                          className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-text transition-colors hover:bg-surface-elevated"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => toggleIndexColumn(col.name, !!v)}
                          />
                          <span className="min-w-0 truncate">{col.name}</span>
                          <span className="ml-auto shrink-0 font-mono text-[12px] text-text-subtle">
                            {col.dataType}
                          </span>
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
              <Notice tone="danger">
                {kind === 'drop-column'
                  ? `Dropping column "${target}" permanently removes its data.`
                  : `Dropping index "${target}" cannot be undone from here.`}
              </Notice>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-muted">Generated SQL</span>
              {previewError ? (
                <p className="rounded-lg border border-danger/15 bg-danger/5 px-3 py-2.5 text-xs text-danger">
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

            {needsDefault && (
              <Notice tone="warning">
                A NOT NULL column needs a default before it can be added to a table that already has
                rows.
              </Notice>
            )}

            {execError && (
              <p className="rounded-lg border border-danger/15 bg-danger/5 px-3 py-2.5 text-xs text-danger">
                {execError}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <Button size="sm" variant="outline" onClick={onClose} disabled={isExecuting}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={isDestructive ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={!operation || !sql || isExecuting || needsDefault}
            >
              {isExecuting ? 'Running…' : isDestructive ? 'Run & drop' : 'Run statement'}
            </Button>
          </div>
        </div>
      }
    />
  )
}

function Notice({ tone, children }: { tone: 'danger' | 'warning'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs',
        tone === 'danger'
          ? 'border-danger/15 bg-danger/5 text-danger'
          : 'border-warning/20 bg-warning/5 text-warning'
      )}
    >
      <IconAlertTriangle size={16} className="shrink-0" />
      <span>{children}</span>
    </div>
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
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-text-subtle">{hint}</span>}
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
  const id = React.useId()
  const hintId = `${id}-hint`
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-text">
          {label}
        </label>
        {hint && (
          <span id={hintId} className="text-xs text-text-muted">
            {hint}
          </span>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={hint ? hintId : undefined}
      />
    </div>
  )
}

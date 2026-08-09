import { IconKey, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { formatColumnType } from '@renderer/lib/column-type'
import type { DdlFormKind, TableDetails } from '@renderer/types'

interface TableStructureProps {
  details: TableDetails
  /** Opens the DDL dialog. Absent for views / read-only tables. */
  onEdit?: (kind: DdlFormKind, target?: string) => void
  /** Optional content rendered above the sections (e.g. the AI actions bar). */
  header?: React.ReactNode
}

function Section({
  title,
  count,
  action,
  children
}: {
  title: string
  count: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-elevated/20 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {title}
          </h3>
          <span className="text-xs tabular-nums text-text-subtle">{count}</span>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function HeaderAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
    >
      {children}
    </button>
  )
}

function RowAction({
  label,
  tone,
  onClick,
  children
}: {
  label: string
  tone: 'neutral' | 'rose'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      className={
        tone === 'rose'
          ? 'border-transparent bg-transparent text-text-subtle hover:bg-danger/15 hover:text-danger hover:ring-1 hover:ring-inset hover:ring-danger/25'
          : 'border-transparent bg-transparent text-text-subtle hover:bg-text-muted/15 hover:text-text-muted hover:ring-1 hover:ring-inset hover:ring-text-muted/25'
      }
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  )
}

const TH = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-subtle'
const TD = 'px-4 py-2 align-middle'

export function TableStructure({ details, onEdit, header }: TableStructureProps) {
  const canEdit = !!onEdit

  return (
    <div className="space-y-5 overflow-auto p-6">
      {header}
      <Section
        title="Columns"
        count={details.columns.length}
        action={
          canEdit && (
            <HeaderAction onClick={() => onEdit?.('add-column')}>
              <IconPlus size={12} />
              Add column
            </HeaderAction>
          )
        }
      >
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr>
              <th className={TH}>Name</th>
              <th className={TH}>Type</th>
              <th className={TH}>Nullable</th>
              <th className={TH}>Default</th>
              {canEdit && <th className="w-20" />}
            </tr>
          </thead>
          <tbody>
            {details.columns.map((col, i) => (
              <tr key={col.name} className={`group ${i > 0 ? 'border-t border-border/50' : ''}`}>
                <td className={`${TD} font-medium text-text`}>
                  <span className="flex items-center gap-1.5">
                    {col.isPrimaryKey && <IconKey size={11} className="shrink-0 text-warning" />}
                    {col.name}
                  </span>
                </td>
                <td className={`${TD} font-mono text-xs text-text-muted`}>
                  {formatColumnType(col.dataType, col.udtName)}
                  {col.characterMaximumLength ? `(${col.characterMaximumLength})` : ''}
                </td>
                <td className={`${TD} text-text-subtle`}>{col.isNullable ? 'YES' : 'NO'}</td>
                <td className={`${TD} font-mono text-xs text-text-subtle`}>
                  {col.defaultValue ?? '—'}
                </td>
                {canEdit && (
                  <td className="px-3 py-1">
                    <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <RowAction
                        label={`Rename ${col.name}`}
                        tone="neutral"
                        onClick={() => onEdit?.('rename-column', col.name)}
                      >
                        <IconPencil stroke={2} />
                      </RowAction>
                      <RowAction
                        label={`Drop ${col.name}`}
                        tone="rose"
                        onClick={() => onEdit?.('drop-column', col.name)}
                      >
                        <IconTrash stroke={2} />
                      </RowAction>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Indexes"
        count={details.indexes.length}
        action={
          canEdit && (
            <HeaderAction onClick={() => onEdit?.('create-index')}>
              <IconPlus size={12} />
              Create index
            </HeaderAction>
          )
        }
      >
        {details.indexes.length === 0 ? (
          <p className="px-4 py-3 text-xs text-text-subtle">No indexes.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-border">
              <tr>
                <th className={TH}>Name</th>
                <th className={TH}>Columns</th>
                <th className={TH}>Flags</th>
                {canEdit && <th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {details.indexes.map((idx, i) => (
                <tr key={idx.name} className={`group ${i > 0 ? 'border-t border-border/50' : ''}`}>
                  <td className={`${TD} font-medium text-text`}>{idx.name}</td>
                  <td className={`${TD} font-mono text-xs text-text-muted`}>
                    {Array.isArray(idx.columns) ? idx.columns.join(', ') : String(idx.columns)}
                  </td>
                  <td className={`${TD} text-xs uppercase tracking-wider text-text-subtle`}>
                    {idx.isPrimary ? 'Primary' : idx.isUnique ? 'Unique' : ''}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-1">
                      <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
                        {!idx.isPrimary && (
                          <RowAction
                            label={`Drop index ${idx.name}`}
                            tone="rose"
                            onClick={() => onEdit?.('drop-index', idx.name)}
                          >
                            <IconTrash stroke={2} />
                          </RowAction>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Foreign keys" count={details.foreignKeys.length}>
        {details.foreignKeys.length === 0 ? (
          <p className="px-4 py-3 text-xs text-text-subtle">No foreign keys.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-border">
              <tr>
                <th className={TH}>Name</th>
                <th className={TH}>Columns</th>
                <th className={TH}>References</th>
                <th className={TH}>On delete</th>
                <th className={TH}>On update</th>
              </tr>
            </thead>
            <tbody>
              {details.foreignKeys.map((fk, i) => (
                <tr key={fk.name} className={i > 0 ? 'border-t border-border/50' : ''}>
                  <td className={`${TD} font-medium text-text`}>{fk.name}</td>
                  <td className={`${TD} font-mono text-xs text-text-muted`}>
                    {Array.isArray(fk.columns) ? fk.columns.join(', ') : String(fk.columns)}
                  </td>
                  <td className={`${TD} font-mono text-xs text-text-muted`}>
                    {fk.referencedSchema}.{fk.referencedTable}(
                    {Array.isArray(fk.referencedColumns)
                      ? fk.referencedColumns.join(', ')
                      : String(fk.referencedColumns)}
                    )
                  </td>
                  <td className={`${TD} text-xs text-text-subtle`}>{fk.onDelete}</td>
                  <td className={`${TD} text-xs text-text-subtle`}>{fk.onUpdate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

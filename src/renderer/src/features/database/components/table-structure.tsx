import {
  IconArrowUpRight,
  IconBraces,
  IconCategory2,
  IconCircleDashed,
  IconColumns,
  IconFlag,
  IconKey,
  IconLetterCase,
  IconLink,
  IconListDetails,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { formatColumnType } from '@renderer/lib/column-type'
import { cn } from '@renderer/lib/utils'
import type { DdlFormKind, TableDetails } from '@renderer/types'

interface TableStructureProps {
  details: TableDetails
  /** Opens the DDL dialog. Absent for views / read-only tables. */
  onEdit?: (kind: DdlFormKind, target?: string) => void
  /** Optional actions rendered on the summary row above the sections (e.g. the AI actions). */
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
    // shrink-0 is load-bearing: these are flex children of a scrolling column, so
    // without it they compress, and overflow-hidden turns that into clipped rows.
    <section className="shrink-0 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex h-12 items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-surface-elevated px-1.5 text-[12px] font-medium tabular-nums text-text-muted">
            {count}
          </span>
        </div>
        {action}
      </div>
      <div className="border-t border-border">{children}</div>
    </section>
  )
}

function SectionAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      <IconPlus size={14} />
      {children}
    </Button>
  )
}

function SectionEmpty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-elevated text-text-subtle">
        {icon}
      </div>
      <p className="text-xs text-text-muted">{children}</p>
    </div>
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
      variant="subtle"
      className={cn('text-text-subtle', tone === 'rose' && 'hover:bg-danger/8 hover:text-danger')}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  )
}

/** A header cell led by its column-type icon, the way Attio heads a table. */
function Th({ icon, children }: { icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <th className="h-9 border-r border-border px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-text-muted last:border-r-0">
      <span className="flex items-center gap-1.5">
        {icon && <span className="flex shrink-0 text-text-subtle">{icon}</span>}
        {children}
      </span>
    </th>
  )
}

const TABLE = 'w-full text-sm'
const HEAD_ROW = 'border-b border-border'
const ROW =
  'group h-9 border-b border-border transition-colors last:border-b-0 hover:bg-surface-elevated/60'
const TD = 'border-r border-border px-3 align-middle last:border-r-0'
const ACTIONS_TD = 'px-2 align-middle'
const ICON = 14

export function TableStructure({ details, onEdit, header }: TableStructureProps) {
  const canEdit = !!onEdit
  const summary = [
    `${details.columns.length} column${details.columns.length === 1 ? '' : 's'}`,
    `${details.indexes.length} index${details.indexes.length === 1 ? '' : 'es'}`,
    `${details.foreignKeys.length} foreign key${details.foreignKeys.length === 1 ? '' : 's'}`
  ].join(', ')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted tabular-nums">{summary}</p>
        {header}
      </div>

      <Section
        title="Columns"
        count={details.columns.length}
        action={
          canEdit && (
            <SectionAction onClick={() => onEdit?.('add-column')}>Add column</SectionAction>
          )
        }
      >
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <Th icon={<IconLetterCase size={ICON} />}>Name</Th>
              <Th icon={<IconCategory2 size={ICON} />}>Type</Th>
              <Th icon={<IconCircleDashed size={ICON} />}>Nullable</Th>
              <Th icon={<IconBraces size={ICON} />}>Default</Th>
              {canEdit && <th className="w-20" />}
            </tr>
          </thead>
          <tbody>
            {details.columns.map((col) => (
              <tr key={col.name} className={ROW}>
                <td className={cn(TD, 'font-medium text-text')}>
                  <span className="flex items-center gap-1.5">
                    {col.isPrimaryKey && (
                      <IconKey
                        size={ICON}
                        className="shrink-0 text-warning"
                        aria-label="Primary key"
                      />
                    )}
                    {col.name}
                  </span>
                </td>
                <td className={cn(TD, 'font-mono text-xs text-text-muted')}>
                  {formatColumnType(col.dataType, col.udtName)}
                  {col.characterMaximumLength ? `(${col.characterMaximumLength})` : ''}
                </td>
                <td className={TD}>
                  <Chip tone="neutral">{col.isNullable ? 'Yes' : 'No'}</Chip>
                </td>
                <td
                  className={cn(
                    TD,
                    'font-mono text-xs',
                    col.defaultValue == null ? 'text-text-subtle' : 'text-text-muted'
                  )}
                >
                  {col.defaultValue ?? '-'}
                </td>
                {canEdit && (
                  <td className={ACTIONS_TD}>
                    <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <RowAction
                        label={`Rename ${col.name}`}
                        tone="neutral"
                        onClick={() => onEdit?.('rename-column', col.name)}
                      >
                        <IconPencil />
                      </RowAction>
                      <RowAction
                        label={`Drop ${col.name}`}
                        tone="rose"
                        onClick={() => onEdit?.('drop-column', col.name)}
                      >
                        <IconTrash />
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
            <SectionAction onClick={() => onEdit?.('create-index')}>Create index</SectionAction>
          )
        }
      >
        {details.indexes.length === 0 ? (
          <SectionEmpty icon={<IconListDetails size={20} />}>No indexes.</SectionEmpty>
        ) : (
          <table className={TABLE}>
            <thead>
              <tr className={HEAD_ROW}>
                <Th icon={<IconLetterCase size={ICON} />}>Name</Th>
                <Th icon={<IconColumns size={ICON} />}>Columns</Th>
                <Th icon={<IconFlag size={ICON} />}>Flags</Th>
                {canEdit && <th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {details.indexes.map((idx) => (
                <tr key={idx.name} className={ROW}>
                  <td className={cn(TD, 'font-medium text-text')}>{idx.name}</td>
                  <td className={cn(TD, 'font-mono text-xs text-text-muted')}>
                    {Array.isArray(idx.columns) ? idx.columns.join(', ') : String(idx.columns)}
                  </td>
                  <td className={TD}>
                    {idx.isPrimary ? (
                      <Chip tone="amber">Primary</Chip>
                    ) : idx.isUnique ? (
                      <Chip tone="sky">Unique</Chip>
                    ) : null}
                  </td>
                  {canEdit && (
                    <td className={ACTIONS_TD}>
                      <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {!idx.isPrimary && (
                          <RowAction
                            label={`Drop index ${idx.name}`}
                            tone="rose"
                            onClick={() => onEdit?.('drop-index', idx.name)}
                          >
                            <IconTrash />
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
          <SectionEmpty icon={<IconLink size={20} />}>No foreign keys.</SectionEmpty>
        ) : (
          <table className={TABLE}>
            <thead>
              <tr className={HEAD_ROW}>
                <Th icon={<IconLetterCase size={ICON} />}>Name</Th>
                <Th icon={<IconColumns size={ICON} />}>Columns</Th>
                <Th icon={<IconArrowUpRight size={ICON} />}>References</Th>
                <Th icon={<IconTrash size={ICON} />}>On delete</Th>
                <Th icon={<IconRefresh size={ICON} />}>On update</Th>
              </tr>
            </thead>
            <tbody>
              {details.foreignKeys.map((fk) => (
                <tr key={fk.name} className={ROW}>
                  <td className={cn(TD, 'font-medium text-text')}>{fk.name}</td>
                  <td className={cn(TD, 'font-mono text-xs text-text-muted')}>
                    {Array.isArray(fk.columns) ? fk.columns.join(', ') : String(fk.columns)}
                  </td>
                  <td className={cn(TD, 'font-mono text-xs text-text-muted')}>
                    {fk.referencedSchema}.{fk.referencedTable}(
                    {Array.isArray(fk.referencedColumns)
                      ? fk.referencedColumns.join(', ')
                      : String(fk.referencedColumns)}
                    )
                  </td>
                  <td className={TD}>
                    <Chip tone={fk.onDelete.toUpperCase() === 'CASCADE' ? 'rose' : 'neutral'}>
                      {fk.onDelete}
                    </Chip>
                  </td>
                  <td className={TD}>
                    <Chip tone="neutral">{fk.onUpdate}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

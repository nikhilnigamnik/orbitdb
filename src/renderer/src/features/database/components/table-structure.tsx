import { IconKey } from '@tabler/icons-react'
import type { TableDetails } from '@renderer/types'

interface TableStructureProps {
  details: TableDetails
}

function Section({
  title,
  count,
  children
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </h3>
        <span className="text-[11px] text-[var(--color-text-subtle)]">{count}</span>
      </div>
      {children}
    </section>
  )
}

export function TableStructure({ details }: TableStructureProps) {
  return (
    <div className="space-y-8 overflow-auto p-6">
      <Section title="Columns" count={details.columns.length}>
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-[12.5px]">
            <thead className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-text-subtle)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Nullable</th>
                <th className="px-3 py-2 text-left font-medium">Default</th>
                <th className="w-10 px-3 py-2 text-left font-medium" />
              </tr>
            </thead>
            <tbody>
              {details.columns.map((col, i) => (
                <tr
                  key={col.name}
                  className={
                    i > 0
                      ? 'border-t border-[var(--color-border)]/60 text-[var(--color-text-muted)]'
                      : 'text-[var(--color-text-muted)]'
                  }
                >
                  <td className="px-3 py-1.5 font-medium text-[var(--color-text)]">{col.name}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">
                    {col.dataType}
                    {col.characterMaximumLength ? `(${col.characterMaximumLength})` : ''}
                  </td>
                  <td className="px-3 py-1.5 text-[var(--color-text-subtle)]">
                    {col.isNullable ? 'YES' : 'NO'}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-[var(--color-text-subtle)]">
                    {col.defaultValue ?? '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    {col.isPrimaryKey && (
                      <IconKey size={11} className="text-[var(--color-text-muted)]" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Indexes" count={details.indexes.length}>
        {details.indexes.length === 0 ? (
          <p className="text-[12px] text-[var(--color-text-subtle)]">No indexes.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-[12.5px]">
              <thead className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Columns</th>
                  <th className="px-3 py-2 text-left font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {details.indexes.map((idx, i) => (
                  <tr
                    key={idx.name}
                    className={
                      i > 0
                        ? 'border-t border-[var(--color-border)]/60 text-[var(--color-text-muted)]'
                        : 'text-[var(--color-text-muted)]'
                    }
                  >
                    <td className="px-3 py-1.5 font-medium text-[var(--color-text)]">{idx.name}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">
                      {Array.isArray(idx.columns) ? idx.columns.join(', ') : String(idx.columns)}
                    </td>
                    <td className="px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                      {idx.isPrimary ? 'Primary' : idx.isUnique ? 'Unique' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Foreign keys" count={details.foreignKeys.length}>
        {details.foreignKeys.length === 0 ? (
          <p className="text-[12px] text-[var(--color-text-subtle)]">No foreign keys.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-[12.5px]">
              <thead className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Columns</th>
                  <th className="px-3 py-2 text-left font-medium">References</th>
                  <th className="px-3 py-2 text-left font-medium">On delete</th>
                  <th className="px-3 py-2 text-left font-medium">On update</th>
                </tr>
              </thead>
              <tbody>
                {details.foreignKeys.map((fk, i) => (
                  <tr
                    key={fk.name}
                    className={
                      i > 0
                        ? 'border-t border-[var(--color-border)]/60 text-[var(--color-text-muted)]'
                        : 'text-[var(--color-text-muted)]'
                    }
                  >
                    <td className="px-3 py-1.5 font-medium text-[var(--color-text)]">{fk.name}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">
                      {Array.isArray(fk.columns) ? fk.columns.join(', ') : String(fk.columns)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">
                      {fk.referencedSchema}.{fk.referencedTable}(
                      {Array.isArray(fk.referencedColumns)
                        ? fk.referencedColumns.join(', ')
                        : String(fk.referencedColumns)}
                      )
                    </td>
                    <td className="px-3 py-1.5 text-[11px]">{fk.onDelete}</td>
                    <td className="px-3 py-1.5 text-[11px]">{fk.onUpdate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

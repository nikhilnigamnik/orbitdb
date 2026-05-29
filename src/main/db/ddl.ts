import type { DdlOperation } from '../../shared/types'

/**
 * Engine-specific hooks the shared DDL builder needs. Identifier quoting and
 * the DROP INDEX grammar differ across Postgres, MySQL and SQLite/D1; the rest
 * of the ALTER TABLE syntax is portable enough to share.
 */
export interface DdlDialect {
  quoteIdent(name: string): string
  qualifiedTable(schema: string, table: string): string
  dropIndex(schema: string, table: string, name: string): string
}

function requireValue(value: string | undefined | null, label: string): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed
}

/**
 * Build a single DDL statement for `operation` against `schema.table`.
 *
 * Identifiers are quoted; `dataType` and `defaultValue` are treated as raw SQL
 * expressions (the UI shows the generated statement before it runs, so the user
 * sees exactly what executes).
 */
export function buildDdl(
  operation: DdlOperation,
  schema: string,
  table: string,
  dialect: DdlDialect
): string {
  const tbl = dialect.qualifiedTable(schema, table)

  switch (operation.kind) {
    case 'add-column': {
      const name = requireValue(operation.name, 'Column name')
      const dataType = requireValue(operation.dataType, 'Data type')
      let sql = `ALTER TABLE ${tbl} ADD COLUMN ${dialect.quoteIdent(name)} ${dataType}`
      if (!operation.isNullable) sql += ' NOT NULL'
      const def = (operation.defaultValue ?? '').trim()
      if (def) sql += ` DEFAULT ${def}`
      return sql
    }
    case 'drop-column': {
      const name = requireValue(operation.name, 'Column name')
      return `ALTER TABLE ${tbl} DROP COLUMN ${dialect.quoteIdent(name)}`
    }
    case 'rename-column': {
      const from = requireValue(operation.from, 'Current column name')
      const to = requireValue(operation.to, 'New column name')
      return `ALTER TABLE ${tbl} RENAME COLUMN ${dialect.quoteIdent(from)} TO ${dialect.quoteIdent(to)}`
    }
    case 'rename-table': {
      const to = requireValue(operation.to, 'New table name')
      return `ALTER TABLE ${tbl} RENAME TO ${dialect.quoteIdent(to)}`
    }
    case 'create-index': {
      const name = requireValue(operation.name, 'Index name')
      const columns = operation.columns.map((c) => c.trim()).filter(Boolean)
      if (columns.length === 0) throw new Error('At least one column is required')
      const unique = operation.isUnique ? 'UNIQUE ' : ''
      const cols = columns.map(dialect.quoteIdent).join(', ')
      return `CREATE ${unique}INDEX ${dialect.quoteIdent(name)} ON ${tbl} (${cols})`
    }
    case 'drop-index': {
      const name = requireValue(operation.name, 'Index name')
      return dialect.dropIndex(schema, table, name)
    }
    default: {
      const exhaustive: never = operation
      throw new Error(`Unsupported DDL operation: ${JSON.stringify(exhaustive)}`)
    }
  }
}

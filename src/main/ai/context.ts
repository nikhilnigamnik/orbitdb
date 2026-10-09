import type {
  ColumnInfo,
  DatabaseEngine,
  SchemaGraphEdge,
  SchemaGraphTable,
  TableDetails
} from '../../shared/types'
import { getSchemaGraph, listSchemas } from '../db/manager'
import {
  MAX_CANDIDATE_TABLES,
  MAX_ENUM_LABELS,
  MAX_SCHEMA_TABLES,
  SCHEMA_FETCH_CONCURRENCY
} from './config'
import { selectRelevantTables } from './schema-relevance'

const SYSTEM_SCHEMAS: Record<DatabaseEngine, string[]> = {
  postgres: ['information_schema', 'pg_catalog', 'pg_toast'],
  mysql: ['information_schema', 'performance_schema', 'mysql', 'sys'],
  d1: []
}

export const ENGINE_DIALECT: Record<DatabaseEngine, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  d1: 'SQLite (Cloudflare D1)'
}

// Mixed-case identifiers (e.g. "createdAt") must be quoted or the engine folds
// their case and the column/table won't be found. Shared by all AI SQL generation.
export const QUOTE_HINT: Record<DatabaseEngine, string> = {
  postgres:
    'ALWAYS wrap every table and column identifier in double quotes (e.g. "createdAt") so mixed-case names are preserved.',
  mysql:
    'ALWAYS wrap every table and column identifier in backticks (e.g. `createdAt`) so mixed-case names are preserved.',
  d1: 'ALWAYS wrap every table and column identifier in double quotes (e.g. "createdAt") so mixed-case names are preserved.'
}

/**
 * Fences untrusted content - schema identifiers, row values - inside a tag so the
 * model can tell data from instructions. Table and column names come from someone
 * else's database and can say anything, including "ignore the above"; a closing
 * tag inside the payload would end the fence early, so it is defanged first.
 */
export function asData(tag: string, content: string): string {
  const closing = new RegExp(`</${tag}>`, 'gi')
  return `<${tag}>\n${content.replace(closing, `<\u2215${tag}>`)}\n</${tag}>`
}

/**
 * Compact, whole-database schema map for grounding free-form SQL.
 *
 * `focus` is whatever the model is about to be asked - the request, the SQL,
 * the error. When the database has more than `MAX_SCHEMA_TABLES` tables, it
 * decides which ones make the cut (`selectRelevantTables`); without it the
 * first ones in catalogue order do, as they always did.
 */
export async function buildSchemaContext(
  connectionId: string,
  engine: DatabaseEngine,
  focus = ''
): Promise<string> {
  const ignored = SYSTEM_SCHEMAS[engine]
  const schemas = (await listSchemas(connectionId)).filter((s) => !ignored.includes(s.name))

  // Every table is a candidate, not only the first MAX_SCHEMA_TABLES - the cut
  // is made by relevance below. Fetched a few schemas at a time, and bounded:
  // a database with hundreds of schemas stops being read once there are far
  // more candidates than will ever be shown.
  const tables: SchemaGraphTable[] = []
  const edges: SchemaGraphEdge[] = []
  let wereSchemasSkipped = false
  for (let start = 0; start < schemas.length; start += SCHEMA_FETCH_CONCURRENCY) {
    if (tables.length >= MAX_CANDIDATE_TABLES) {
      wereSchemasSkipped = true
      break
    }
    const batch = schemas.slice(start, start + SCHEMA_FETCH_CONCURRENCY)
    const graphs = await Promise.all(batch.map((s) => getSchemaGraph(connectionId, s.name)))
    for (const graph of graphs) {
      tables.push(...graph.tables)
      edges.push(...graph.edges)
    }
  }

  const shown = selectRelevantTables(tables, edges, focus, MAX_SCHEMA_TABLES)
  const shownKeys = new Set(shown.map((t) => `${t.schema}.${t.name}`))

  const lines: string[] = []
  for (const table of shown) {
    const cols = table.columns
      .map((c) => {
        const flags = [c.isPrimaryKey ? 'PK' : '', c.isNullable ? '' : 'NOT NULL']
          .filter(Boolean)
          .join(' ')
        // Same renderer as the single-table context: an enum has to arrive as
        // its type name plus its labels, or generated SQL guesses the value.
        return `${c.name} ${columnType(c)}${flags ? ' ' + flags : ''}${enumSuffix(c)}`
      })
      .join(', ')
    lines.push(`${table.schema}.${table.name}(${cols})`)
  }

  // Only edges between tables that are shown: a foreign key to a table the
  // model was never given invites it to guess that table's columns.
  for (const edge of edges) {
    const from = `${edge.from.schema}.${edge.from.table}`
    const to = `${edge.to.schema}.${edge.to.table}`
    if (!shownKeys.has(from) || !shownKeys.has(to)) continue
    lines.push(
      `FK: ${edge.from.table}(${edge.from.columns.join(', ')}) -> ` +
        `${edge.to.table}(${edge.to.columns.join(', ')})`
    )
  }

  // Say so rather than letting the model treat a partial map as the whole
  // database and confidently reference tables it was never shown.
  if (shown.length < tables.length || wereSchemasSkipped) {
    lines.push(
      `-- NOTE: this database has more tables than are listed; these ${shown.length} were ` +
        `picked as the most relevant to the request. If it needs a table that is not above, ` +
        `say so instead of guessing its shape.`
    )
  }

  return lines.join('\n')
}

/**
 * The parts of a column these helpers need. Structural rather than `ColumnInfo`
 * so the whole-database graph (`SchemaGraphColumn`) renders through exactly the
 * same code as a single table's details - the two builders drifting apart is
 * what left the Query page describing enums as `USER-DEFINED`.
 */
type TypedColumn = Pick<ColumnInfo, 'dataType' | 'udtName' | 'enumValues'>

/**
 * Postgres reports every enum, domain and composite as the literal string
 * `USER-DEFINED` in `information_schema`; the real name only lives in `udtName`.
 * MySQL's dataType is already `enum('a','b')`, so naming an enum by its udtName
 * either way keeps the labels from being printed twice - and keeps MAX_ENUM_LABELS
 * in charge of how many are shown.
 */
export function columnType(c: TypedColumn): string {
  if (c.enumValues?.length) return c.udtName
  return c.dataType === 'USER-DEFINED' ? c.udtName : c.dataType
}

/**
 * '' for non-enum columns. Without this the model has no way to know an enum's
 * labels are capitalised and guesses a lowercase value the engine rejects.
 *
 * The `values:` marker is a contract with the system prompts in filter-table.ts
 * and generate-seed.ts, which tell the model what a column carrying it may hold -
 * change them together.
 */
export function enumSuffix(c: TypedColumn): string {
  const labels = c.enumValues
  if (!labels?.length) return ''
  const shown = labels
    .slice(0, MAX_ENUM_LABELS)
    .map((v) => `'${v}'`)
    .join(' | ')
  const rest = labels.length - MAX_ENUM_LABELS
  return rest > 0 ? ` values: ${shown} (+${rest} more)` : ` values: ${shown}`
}

/** Detailed single-table description for table-scoped features. */
export function buildTableContext(details: TableDetails): string {
  const lines: string[] = [`Table: ${details.schema}.${details.name} (${details.type})`]

  lines.push('Columns:')
  for (const c of details.columns) {
    const flags = [
      c.isPrimaryKey ? 'PK' : '',
      c.isNullable ? 'nullable' : 'NOT NULL',
      c.defaultValue ? `default ${c.defaultValue}` : ''
    ]
      .filter(Boolean)
      .join(', ')
    lines.push(`  - ${c.name} ${columnType(c)}${flags ? ` (${flags})` : ''}${enumSuffix(c)}`)
  }

  if (details.primaryKey.length) {
    lines.push(`Primary key: ${details.primaryKey.join(', ')}`)
  }

  if (details.indexes.length) {
    lines.push('Indexes:')
    for (const idx of details.indexes) {
      const kind = idx.isPrimary ? 'primary' : idx.isUnique ? 'unique' : 'index'
      lines.push(`  - ${idx.name} (${kind}) on (${idx.columns.join(', ')})`)
    }
  }

  if (details.foreignKeys.length) {
    lines.push('Foreign keys:')
    for (const fk of details.foreignKeys) {
      lines.push(
        `  - ${fk.columns.join(', ')} -> ${fk.referencedSchema}.${fk.referencedTable}(${fk.referencedColumns.join(', ')})`
      )
    }
  }

  if (details.estimatedRows != null) {
    lines.push(`Estimated rows: ${details.estimatedRows}`)
  }

  return lines.join('\n')
}

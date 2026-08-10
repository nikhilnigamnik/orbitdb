import type { ColumnInfo, ForeignKeyInfo, IndexInfo } from '../../shared/types'
import type { DdlDialect } from './ddl'
import type { FilterDialect } from './filters'

/**
 * The SQLite dialect pieces D1 is built on, kept out of the driver so they can
 * be tested without a live database: pragma row mapping, identifier quoting,
 * type normalisation, and the DDL and filter dialects.
 */

/** SQLite has no schemas; everything lives in `main`. */
export const SQLITE_SCHEMA = 'main'

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export const sqliteFilterDialect: FilterDialect = {
  quoteIdent,
  placeholder: () => '?',
  // SQLite has no ILIKE, but its LIKE is already case-insensitive for ASCII.
  supportsIlike: false
}

// SQLite has no schemas - identifiers are table-only and indexes are global.
export const sqliteDdlDialect: DdlDialect = {
  quoteIdent,
  qualifiedTable: (_schema, table) => quoteIdent(table),
  dropIndex: (_schema, _table, name) => `DROP INDEX ${quoteIdent(name)}`,
  // SQLite has no TRUNCATE - DELETE FROM clears every row.
  truncate: (_schema, table) => `DELETE FROM ${quoteIdent(table)}`
}

/**
 * Map a declared SQLite type onto the udt names the renderer switches on.
 * SQLite types are advisory text, so this matches loosely on purpose.
 */
export function normalizeUdtName(declared: string): string {
  const t = declared.toLowerCase().trim()
  if (!t) return 'text'
  if (t.includes('json')) return 'json'
  if (t.includes('bool')) return 'bool'
  if (
    t.includes('int') ||
    t.includes('real') ||
    t.includes('floa') ||
    t.includes('doub') ||
    t.includes('numeric') ||
    t.includes('decimal')
  ) {
    return t.includes('int') ? 'int4' : 'float8'
  }
  return 'text'
}

export interface TableInfoRow {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

export interface IndexListRow {
  seq: number
  name: string
  unique: number
  origin: string
  partial: number
}

export interface IndexInfoRow {
  seqno: number
  cid: number
  name: string
}

export interface ForeignKeyRow {
  id: number
  seq: number
  table: string
  from: string
  to: string
  on_update: string
  on_delete: string
}

export function toColumns(rows: TableInfoRow[]): ColumnInfo[] {
  return rows.map((r) => ({
    name: String(r.name),
    dataType: String(r.type || 'TEXT'),
    udtName: normalizeUdtName(String(r.type)),
    isNullable: Number(r.notnull) === 0,
    isPrimaryKey: Number(r.pk) > 0,
    defaultValue: r.dflt_value == null ? null : String(r.dflt_value),
    ordinalPosition: Number(r.cid) + 1,
    characterMaximumLength: null,
    enumValues: null
  }))
}

/** `pk` is the 1-based position within the key, so it doubles as the order. */
export function toPrimaryKey(rows: TableInfoRow[]): string[] {
  return rows
    .filter((r) => Number(r.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((r) => String(r.name))
}

export function toIndex(index: IndexListRow, columns: IndexInfoRow[]): IndexInfo {
  return {
    name: String(index.name),
    isUnique: Number(index.unique) === 1,
    isPrimary: index.origin === 'pk',
    columns: [...columns]
      .sort((a, b) => Number(a.seqno) - Number(b.seqno))
      .map((c) => String(c.name)),
    definition: ''
  }
}

/**
 * `pragma foreign_key_list` returns one row per column pair, keyed by `id` -
 * a composite key arrives as several rows that have to be regrouped, in `seq`
 * order, or the columns pair up wrongly.
 */
export function toForeignKeys(rows: ForeignKeyRow[]): ForeignKeyInfo[] {
  interface Group {
    table: string
    onUpdate: string
    onDelete: string
    pairs: { from: string; to: string; seq: number }[]
  }
  const groups = new Map<number, Group>()

  for (const fk of rows) {
    const id = Number(fk.id)
    const pair = { from: String(fk.from), to: String(fk.to), seq: Number(fk.seq) }
    const existing = groups.get(id)
    if (existing) {
      existing.pairs.push(pair)
    } else {
      groups.set(id, {
        table: String(fk.table),
        onUpdate: String(fk.on_update ?? 'NO ACTION'),
        onDelete: String(fk.on_delete ?? 'NO ACTION'),
        pairs: [pair]
      })
    }
  }

  return [...groups.entries()].map(([id, group]) => {
    const sorted = [...group.pairs].sort((a, b) => a.seq - b.seq)
    return {
      // SQLite does not name its foreign keys; the pragma's id is all there is.
      name: `fk_${id}`,
      columns: sorted.map((p) => p.from),
      referencedSchema: SQLITE_SCHEMA,
      referencedTable: group.table,
      referencedColumns: sorted.map((p) => p.to),
      onDelete: group.onDelete,
      onUpdate: group.onUpdate
    }
  })
}

/** Tables and views, minus SQLite's and Cloudflare's internal bookkeeping. */
export const LIST_TABLES_SQL = `select name, type from sqlite_master
  where type in ('table', 'view')
    and name not like 'sqlite_%'
    and name not like '_cf_%'
  order by name`

export const LIST_BASE_TABLES_SQL = `select name from sqlite_master
  where type = 'table'
    and name not like 'sqlite_%'
    and name not like '_cf_%'
  order by name`

/**
 * What Postgres reports about itself, out of pg_catalog and information_schema.
 *
 * Enum labels are read separately: the catalogue reports every enum column as
 * the literal string USER-DEFINED, so the type name has to be resolved through
 * pg_type before anything can be said about the column's domain.
 */

import { Pool } from 'pg'
import {
  type ColumnInfo,
  type ForeignKeyInfo,
  type IndexInfo,
  type ReferencingKeyInfo,
  type SchemaGraph,
  type SchemaGraphEdge,
  type SchemaGraphTable,
  type SchemaInfo,
  type TableDetails,
  type TableInfo
} from '../../../../shared/types'
import { getPool, tableCacheKey, tableDetailsCache } from './pool'

export const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast']
export async function listSchemas(connectionId: string): Promise<SchemaInfo[]> {
  const pool = await getPool(connectionId)
  const res = await pool.query<{ name: string }>(
    `select nspname as name
       from pg_namespace
      where nspname not in (${SYSTEM_SCHEMAS.map((_, i) => `$${i + 1}`).join(', ')})
        and nspname not like 'pg_temp_%'
        and nspname not like 'pg_toast_temp_%'
      order by nspname`,
    SYSTEM_SCHEMAS
  )
  return res.rows
}
export async function listTables(connectionId: string, schema: string): Promise<TableInfo[]> {
  const pool = await getPool(connectionId)
  const res = await pool.query<{
    schema: string
    name: string
    kind: string
    estimated_rows: string | null
  }>(
    `select n.nspname as schema,
            c.relname as name,
            c.relkind::text as kind,
            case when c.reltuples >= 0 then c.reltuples::bigint::text else null end as estimated_rows
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1
        and c.relkind in ('r','v','m','p')
      order by c.relname`,
    [schema]
  )
  return res.rows.map((r) => ({
    schema: r.schema,
    name: r.name,
    type: r.kind === 'v' ? 'view' : r.kind === 'm' ? 'materialized_view' : 'table',
    estimatedRows: r.estimated_rows == null ? null : Number(r.estimated_rows)
  }))
}
/**
 * Enum labels for every `USER-DEFINED` column in `rows`, keyed `schema.type`.
 *
 * Shared by tableDetails and getSchemaGraph so the two cannot disagree about
 * what a column's type is - they did, and the whole-database map was the one
 * still handing the model the bare `USER-DEFINED` placeholder.
 *
 * One extra round-trip, and only when the table actually has such a column.
 */
async function enumLabelsFor(
  pool: Pool,
  rows: { data_type: string; udt_schema: string; udt_name: string }[]
): Promise<Map<string, string[]>> {
  const byType = new Map<string, string[]>()
  const userDefinedTypes = [
    ...new Set(
      rows.filter((r) => r.data_type === 'USER-DEFINED').map((r) => `${r.udt_schema}.${r.udt_name}`)
    )
  ]
  if (userDefinedTypes.length === 0) return byType

  const enumRes = await pool.query<{ type_key: string; labels: string[] }>(
    `select n.nspname || '.' || t.typname as type_key,
            array_agg(e.enumlabel::text order by e.enumsortorder) as labels
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
       join pg_enum e on e.enumtypid = t.oid
      where n.nspname || '.' || t.typname = any($1)
      group by n.nspname, t.typname`,
    [userDefinedTypes]
  )
  for (const r of enumRes.rows) byType.set(r.type_key, r.labels)
  return byType
}
export async function tableDetails(
  connectionId: string,
  schema: string,
  table: string
): Promise<TableDetails> {
  const cacheKey = tableCacheKey(connectionId, schema, table)
  const cached = tableDetailsCache.get(cacheKey)
  if (cached) return cached

  const pool = await getPool(connectionId)

  const kindRes = await pool.query<{ kind: string; estimated_rows: string | null }>(
    `select c.relkind::text as kind,
            case when c.reltuples >= 0 then c.reltuples::bigint::text else null end as estimated_rows
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2
      limit 1`,
    [schema, table]
  )
  if (kindRes.rowCount === 0) {
    throw new Error(`Table ${schema}.${table} not found`)
  }
  const kind = kindRes.rows[0].kind
  const type: TableDetails['type'] =
    kind === 'v' ? 'view' : kind === 'm' ? 'materialized_view' : 'table'

  const pkRes = await pool.query<{ column: string }>(
    `select a.attname as column
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and i.indisprimary
      order by array_position(i.indkey, a.attnum)`,
    [schema, table]
  )
  const primaryKey = pkRes.rows.map((r) => r.column)

  const colsRes = await pool.query<{
    name: string
    data_type: string
    udt_schema: string
    udt_name: string
    is_nullable: string
    default_value: string | null
    ordinal_position: number
    character_maximum_length: number | null
  }>(
    `select column_name as name,
            data_type,
            udt_schema,
            udt_name,
            is_nullable,
            column_default as default_value,
            ordinal_position,
            character_maximum_length
       from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position`,
    [schema, table]
  )

  const enumLabelsByType = await enumLabelsFor(pool, colsRes.rows)

  const pkSet = new Set(primaryKey)
  const columns: ColumnInfo[] = colsRes.rows.map((r) => ({
    name: r.name,
    dataType: r.data_type,
    udtName: r.udt_name,
    isNullable: r.is_nullable === 'YES',
    isPrimaryKey: pkSet.has(r.name),
    defaultValue: r.default_value,
    ordinalPosition: r.ordinal_position,
    characterMaximumLength: r.character_maximum_length,
    enumValues: enumLabelsByType.get(`${r.udt_schema}.${r.udt_name}`) ?? null
  }))

  const idxRes = await pool.query<{
    name: string
    is_unique: boolean
    is_primary: boolean
    columns: string[]
    definition: string
  }>(
    `select i.relname as name,
            ix.indisunique as is_unique,
            ix.indisprimary as is_primary,
            array_agg(a.attname::text order by array_position(ix.indkey, a.attnum)) as columns,
            pg_get_indexdef(ix.indexrelid) as definition
       from pg_index ix
       join pg_class i on i.oid = ix.indexrelid
       join pg_class c on c.oid = ix.indrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum = any(ix.indkey)
      where n.nspname = $1 and c.relname = $2
      group by i.relname, ix.indisunique, ix.indisprimary, ix.indexrelid
      order by i.relname`,
    [schema, table]
  )
  const indexes: IndexInfo[] = idxRes.rows.map((r) => ({
    name: r.name,
    isUnique: r.is_unique,
    isPrimary: r.is_primary,
    columns: r.columns,
    definition: r.definition
  }))

  const fkRes = await pool.query<{
    name: string
    columns: string[]
    referenced_schema: string
    referenced_table: string
    referenced_columns: string[]
    on_delete: string
    on_update: string
  }>(
    `select con.conname as name,
            array_agg(a.attname::text order by k.ord) as columns,
            rn.nspname as referenced_schema,
            rc.relname as referenced_table,
            array_agg(ra.attname::text order by k.ord) as referenced_columns,
            case con.confdeltype
              when 'a' then 'NO ACTION'
              when 'r' then 'RESTRICT'
              when 'c' then 'CASCADE'
              when 'n' then 'SET NULL'
              when 'd' then 'SET DEFAULT'
              else 'NO ACTION'
            end as on_delete,
            case con.confupdtype
              when 'a' then 'NO ACTION'
              when 'r' then 'RESTRICT'
              when 'c' then 'CASCADE'
              when 'n' then 'SET NULL'
              when 'd' then 'SET DEFAULT'
              else 'NO ACTION'
            end as on_update
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_class rc on rc.oid = con.confrelid
       join pg_namespace rn on rn.oid = rc.relnamespace
       join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
       join lateral unnest(con.confkey) with ordinality as rk(attnum, ord) on rk.ord = k.ord
       join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = rk.attnum
      where con.contype = 'f' and n.nspname = $1 and c.relname = $2
      group by con.conname, rn.nspname, rc.relname, con.confdeltype, con.confupdtype
      order by con.conname`,
    [schema, table]
  )
  const foreignKeys: ForeignKeyInfo[] = fkRes.rows.map((r) => ({
    name: r.name,
    columns: r.columns,
    referencedSchema: r.referenced_schema,
    referencedTable: r.referenced_table,
    referencedColumns: r.referenced_columns,
    onDelete: r.on_delete,
    onUpdate: r.on_update
  }))

  const result: TableDetails = {
    schema,
    name: table,
    type,
    columns,
    primaryKey,
    indexes,
    foreignKeys,
    estimatedRows:
      kindRes.rows[0].estimated_rows == null ? null : Number(kindRes.rows[0].estimated_rows)
  }
  tableDetailsCache.set(cacheKey, result)
  return result
}
/**
 * The same constraint catalogue as `tableDetails`, filtered on the referenced
 * side instead of the referencing one, so it finds the children pointing here.
 * Not folded into `tableDetails`: that result is cached per table and this scans
 * every constraint in the database, which is a cost the data grid should not pay
 * on every table it opens.
 */
export async function referencingKeys(
  connectionId: string,
  schema: string,
  table: string
): Promise<ReferencingKeyInfo[]> {
  const pool = await getPool(connectionId)
  const res = await pool.query<{
    name: string
    child_schema: string
    child_table: string
    columns: string[]
    referenced_columns: string[]
    on_delete: string
    on_update: string
  }>(
    `select con.conname as name,
            n.nspname as child_schema,
            c.relname as child_table,
            array_agg(a.attname::text order by k.ord) as columns,
            array_agg(ra.attname::text order by k.ord) as referenced_columns,
            case con.confdeltype
              when 'a' then 'NO ACTION'
              when 'r' then 'RESTRICT'
              when 'c' then 'CASCADE'
              when 'n' then 'SET NULL'
              when 'd' then 'SET DEFAULT'
              else 'NO ACTION'
            end as on_delete,
            case con.confupdtype
              when 'a' then 'NO ACTION'
              when 'r' then 'RESTRICT'
              when 'c' then 'CASCADE'
              when 'n' then 'SET NULL'
              when 'd' then 'SET DEFAULT'
              else 'NO ACTION'
            end as on_update
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_class rc on rc.oid = con.confrelid
       join pg_namespace rn on rn.oid = rc.relnamespace
       join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
       join lateral unnest(con.confkey) with ordinality as rk(attnum, ord) on rk.ord = k.ord
       join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = rk.attnum
      where con.contype = 'f' and rn.nspname = $1 and rc.relname = $2
      group by con.conname, n.nspname, c.relname, con.confdeltype, con.confupdtype
      order by n.nspname, c.relname, con.conname`,
    [schema, table]
  )
  return res.rows.map((r) => ({
    name: r.name,
    schema: r.child_schema,
    table: r.child_table,
    columns: r.columns,
    referencedSchema: schema,
    referencedTable: table,
    referencedColumns: r.referenced_columns,
    onDelete: r.on_delete,
    onUpdate: r.on_update
  }))
}
export async function getSchemaGraph(connectionId: string, schema: string): Promise<SchemaGraph> {
  const pool = await getPool(connectionId)

  const tablesPromise = pool.query<{ name: string }>(
    `select c.relname as name
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind in ('r','p')
      order by c.relname`,
    [schema]
  )

  const columnsPromise = pool.query<{
    table: string
    name: string
    data_type: string
    udt_schema: string
    udt_name: string
    is_nullable: string
  }>(
    `select table_name as table,
            column_name as name,
            data_type,
            udt_schema,
            udt_name,
            is_nullable
       from information_schema.columns
      where table_schema = $1
      order by table_name, ordinal_position`,
    [schema]
  )

  const pksPromise = pool.query<{ table: string; column: string }>(
    `select c.relname as table, a.attname as column
       from pg_index i
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where n.nspname = $1 and i.indisprimary and c.relkind in ('r','p')`,
    [schema]
  )

  const edgesPromise = pool.query<{
    name: string
    from_table: string
    from_columns: string[]
    to_schema: string
    to_table: string
    to_columns: string[]
  }>(
    `select con.conname as name,
            c.relname as from_table,
            array_agg(a.attname::text order by k.ord) as from_columns,
            rn.nspname as to_schema,
            rc.relname as to_table,
            array_agg(ra.attname::text order by k.ord) as to_columns
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_class rc on rc.oid = con.confrelid
       join pg_namespace rn on rn.oid = rc.relnamespace
       join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
       join lateral unnest(con.confkey) with ordinality as rk(attnum, ord) on rk.ord = k.ord
       join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = rk.attnum
      where con.contype = 'f' and n.nspname = $1
      group by con.conname, rn.nspname, rc.relname, c.relname
      order by c.relname, con.conname`,
    [schema]
  )

  const [tablesRes, columnsRes, pksRes, edgesRes] = await Promise.all([
    tablesPromise,
    columnsPromise,
    pksPromise,
    edgesPromise
  ])

  const enumLabelsByType = await enumLabelsFor(pool, columnsRes.rows)

  const pkSet = new Set(pksRes.rows.map((r) => `${r.table}.${r.column}`))
  const columnsByTable = new Map<string, SchemaGraphTable['columns']>()
  for (const row of columnsRes.rows) {
    const list = columnsByTable.get(row.table) ?? []
    list.push({
      name: row.name,
      dataType: row.data_type,
      udtName: row.udt_name,
      isNullable: row.is_nullable === 'YES',
      isPrimaryKey: pkSet.has(`${row.table}.${row.name}`),
      enumValues: enumLabelsByType.get(`${row.udt_schema}.${row.udt_name}`) ?? null
    })
    columnsByTable.set(row.table, list)
  }

  const tables: SchemaGraphTable[] = tablesRes.rows.map((t) => ({
    schema,
    name: t.name,
    columns: columnsByTable.get(t.name) ?? []
  }))

  const edges: SchemaGraphEdge[] = edgesRes.rows.map((e) => ({
    name: e.name,
    from: { schema, table: e.from_table, columns: e.from_columns },
    to: { schema: e.to_schema, table: e.to_table, columns: e.to_columns }
  }))

  return { schema, tables, edges }
}

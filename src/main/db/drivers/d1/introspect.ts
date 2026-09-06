/**
 * What SQLite can be asked about itself, through pragma rather than a catalogue.
 */

import {
  type IndexInfo,
  type ReferencingKeyInfo,
  type SchemaGraph,
  type SchemaGraphEdge,
  type SchemaGraphTable,
  type SchemaInfo,
  type TableDetails,
  type TableInfo
} from '../../../../shared/types'
import {
  LIST_BASE_TABLES_SQL,
  LIST_TABLES_SQL,
  SQLITE_SCHEMA,
  normalizeUdtName,
  quoteIdent,
  toColumns,
  toForeignKeys,
  toIndex,
  toPrimaryKey,
  type ForeignKeyRow,
  type IndexInfoRow,
  type IndexListRow,
  type TableInfoRow
} from '../../sqlite-shared'
import {
  D1_MAX_CONCURRENT_REQUESTS,
  callD1,
  loadSaved,
  mapWithConcurrency,
  tableCacheKey,
  tableDetailsCache
} from './client'

export async function listSchemas(connectionId: string): Promise<SchemaInfo[]> {
  void connectionId
  return [{ name: SQLITE_SCHEMA }]
}
export async function listTables(connectionId: string, schema: string): Promise<TableInfo[]> {
  void schema
  const saved = loadSaved(connectionId)
  const entry = await callD1<{ name: string; type: string }>(saved, LIST_TABLES_SQL)
  return entry.results.map((r) => ({
    schema: SQLITE_SCHEMA,
    name: String(r.name),
    type: r.type === 'view' ? 'view' : 'table',
    estimatedRows: null
  }))
}
export async function tableDetails(
  connectionId: string,
  schema: string,
  table: string
): Promise<TableDetails> {
  const cacheKey = tableCacheKey(connectionId, schema, table)
  const cached = tableDetailsCache.get(cacheKey)
  if (cached) return cached

  const saved = loadSaved(connectionId)

  const metaEntry = await callD1<{ type: string; sql: string | null }>(
    saved,
    `select type, sql from sqlite_master where type in ('table', 'view') and name = ? limit 1`,
    [table]
  )
  if (metaEntry.results.length === 0) {
    throw new Error(`Table ${table} not found`)
  }
  const type: TableDetails['type'] = metaEntry.results[0].type === 'view' ? 'view' : 'table'

  // PRAGMAs don't accept bind params; embed quoted identifier literally.
  const tableIdent = quoteIdent(table)

  // Every pragma is a separate HTTP round-trip to Cloudflare - issue the
  // independent ones together instead of paying the latency three times over.
  const [colEntry, idxListEntry, fkEntry] = await Promise.all([
    callD1<TableInfoRow>(saved, `pragma table_info(${tableIdent})`),
    callD1<IndexListRow>(saved, `pragma index_list(${tableIdent})`),
    callD1<ForeignKeyRow>(saved, `pragma foreign_key_list(${tableIdent})`)
  ])

  const columns = toColumns(colEntry.results)
  const primaryKey = toPrimaryKey(colEntry.results)

  const indexes: IndexInfo[] = await mapWithConcurrency(idxListEntry.results, async (idx) => {
    const colsEntry = await callD1<IndexInfoRow>(
      saved,
      `pragma index_info(${quoteIdent(String(idx.name))})`
    )
    return toIndex(idx, colsEntry.results)
  })

  const foreignKeys = toForeignKeys(fkEntry.results)

  const result: TableDetails = {
    schema,
    name: table,
    type,
    columns,
    primaryKey,
    indexes,
    foreignKeys,
    estimatedRows: null
  }
  tableDetailsCache.set(cacheKey, result)
  return result
}
/**
 * SQLite has no reverse foreign-key catalogue - `pragma foreign_key_list` only
 * answers "what does this table point at". So the whole database is swept and
 * the answers filtered, which is one request per table. Acceptable because the
 * row editor asks for it once per row opened, not per keystroke.
 */
export async function referencingKeys(
  connectionId: string,
  schema: string,
  table: string
): Promise<ReferencingKeyInfo[]> {
  const saved = loadSaved(connectionId)
  const tableList = await callD1<{ name: string }>(saved, LIST_BASE_TABLES_SQL)
  // The table itself is included: a `parent_id` pointing at its own table is a
  // real child, and skipping it hid every tree - the row editor showed no
  // dependents and a cascade would have missed the branch below.
  const candidates = tableList.results.map((r) => String(r.name))

  const perTable = await mapWithConcurrency(candidates, async (childTable) => {
    const entry = await callD1<ForeignKeyRow>(
      saved,
      `pragma foreign_key_list(${quoteIdent(childTable)})`
    )
    return { childTable, foreignKeys: toForeignKeys(entry.results) }
  })

  const out: ReferencingKeyInfo[] = []
  for (const { childTable, foreignKeys } of perTable) {
    for (const fk of foreignKeys) {
      // SQLite reports the parent unqualified, and D1 has exactly one schema.
      if (fk.referencedTable !== table) continue
      out.push({
        ...fk,
        // The pragma id is unique per child table, not per database.
        name: `${childTable}_${fk.name}`,
        schema,
        table: childTable,
        referencedSchema: schema
      })
    }
  }
  return out
}
export async function getSchemaGraph(connectionId: string, schema: string): Promise<SchemaGraph> {
  const saved = loadSaved(connectionId)

  const tableList = await callD1<{ name: string }>(saved, LIST_BASE_TABLES_SQL)
  const tableNames = tableList.results.map((r) => String(r.name))

  // Halved: each item issues two requests, so this still caps in-flight at ~6.
  const perTable = await mapWithConcurrency(
    tableNames,
    async (tableName) => {
      const ident = quoteIdent(tableName)
      const [colEntry, fkEntry] = await Promise.all([
        callD1<{ name: string; type: string; notnull: number; pk: number }>(
          saved,
          `pragma table_info(${ident})`
        ),
        callD1<{ id: number; seq: number; table: string; from: string; to: string }>(
          saved,
          `pragma foreign_key_list(${ident})`
        )
      ])
      return { tableName, colEntry, fkEntry }
    },
    D1_MAX_CONCURRENT_REQUESTS / 2
  )

  const tables: SchemaGraphTable[] = []
  const edges: SchemaGraphEdge[] = []

  for (const { tableName, colEntry, fkEntry } of perTable) {
    tables.push({
      schema,
      name: tableName,
      columns: colEntry.results.map((c) => ({
        name: String(c.name),
        dataType: String(c.type || 'TEXT'),
        udtName: normalizeUdtName(String(c.type || 'TEXT')),
        isNullable: Number(c.notnull) === 0,
        isPrimaryKey: Number(c.pk) > 0,
        // SQLite has no enum type, and CHECK constraints are not parsed.
        enumValues: null
      }))
    })

    const fkGroups = new Map<
      number,
      { table: string; pairs: { from: string; to: string; seq: number }[] }
    >()
    for (const fk of fkEntry.results) {
      const id = Number(fk.id)
      const existing = fkGroups.get(id)
      if (existing) {
        existing.pairs.push({ from: String(fk.from), to: String(fk.to), seq: Number(fk.seq) })
      } else {
        fkGroups.set(id, {
          table: String(fk.table),
          pairs: [{ from: String(fk.from), to: String(fk.to), seq: Number(fk.seq) }]
        })
      }
    }
    for (const [id, group] of fkGroups) {
      const sorted = group.pairs.sort((a, b) => a.seq - b.seq)
      edges.push({
        name: `${tableName}_fk_${id}`,
        from: { schema, table: tableName, columns: sorted.map((p) => p.from) },
        to: { schema, table: group.table, columns: sorted.map((p) => p.to) }
      })
    }
  }

  return { schema, tables, edges }
}

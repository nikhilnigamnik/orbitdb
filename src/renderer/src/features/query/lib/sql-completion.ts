import { MySQL, PostgreSQL, SQLite, type SQLDialect, type SQLNamespace } from '@codemirror/lang-sql'
import type { DatabaseEngine, SchemaGraph } from '@renderer/types'

/** Postgres and SQLite quote with `"`, MySQL with backticks - the dialect knows. */
export function dialectFor(engine: DatabaseEngine): SQLDialect {
  if (engine === 'mysql') return MySQL
  if (engine === 'd1') return SQLite
  return PostgreSQL
}

/**
 * The completion namespace CodeMirror wants, built from the schema graphs the
 * app already fetches for the diagram.
 *
 * Tables appear twice on purpose: qualified (`public.users`) and bare (`users`)
 * for the default schema. Real queries are written unqualified, so completing
 * only the qualified form would mean the common case never fires - but a name
 * in a non-default schema still has to be reachable.
 *
 * A bare name is never allowed to overwrite one already claimed by an earlier
 * schema: with `public` first, `public.users` keeps `users`, and a same-named
 * table elsewhere stays available under its own prefix.
 */
export function buildSqlSchema(graphs: SchemaGraph[], defaultSchema?: string): SQLNamespace {
  const namespace: SQLNamespace = {}
  const bare: SQLNamespace = {}

  const ordered = defaultSchema
    ? [...graphs].sort((a, b) =>
        a.schema === defaultSchema ? -1 : b.schema === defaultSchema ? 1 : 0
      )
    : graphs

  for (const graph of ordered) {
    const tables: SQLNamespace = {}
    for (const table of graph.tables) {
      const columns = table.columns.map((column) => column.name)
      tables[table.name] = columns
      if (!(table.name in bare)) bare[table.name] = columns
    }
    namespace[graph.schema] = tables
  }

  return { ...namespace, ...bare }
}

/** Every table name, qualified only when it is not in the default schema. */
export function tableNames(graphs: SchemaGraph[], defaultSchema?: string): string[] {
  return graphs.flatMap((graph) =>
    graph.tables.map((table) =>
      graph.schema === defaultSchema || graphs.length === 1
        ? table.name
        : `${graph.schema}.${table.name}`
    )
  )
}

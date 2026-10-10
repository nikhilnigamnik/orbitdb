import * as React from 'react'
import type { SQLNamespace } from '@codemirror/lang-sql'
import { unwrap } from '@renderer/lib/ipc'
import type { SchemaGraph } from '@renderer/types'
import { defaultSchema } from '@renderer/features/database/components/default-schema'
import { buildSqlSchema } from '../lib/sql-completion'

/**
 * More than this and the completion list stops being a list. Loading them all
 * would also mean one round-trip per schema against a database that evidently
 * has a lot going on.
 */
const MAX_SCHEMAS = 5

/**
 * The schemas worth loading: the one unqualified names resolve to, then the
 * rest in the order the engine lists them, up to the cap.
 *
 * The default is chosen rather than taken as the first listed: Postgres lists
 * schemas alphabetically, so on a Supabase database `public` sat behind auth,
 * extensions, graphql and the rest, was never loaded, and a bare `users`
 * completed to auth.users.
 */
export function schemasToLoad(names: string[], currentDatabase?: string | null): string[] {
  if (names.length === 0) return []
  const primary = defaultSchema(names, currentDatabase)
  return [primary, ...names.filter((name) => name !== primary)].slice(0, MAX_SCHEMAS)
}

/**
 * Tables and columns for editor completion.
 *
 * Reuses `db:schema-graph`, which the diagram already relies on: it returns
 * every table with its columns in one call per schema, where `tableDetails`
 * would be one call per table.
 *
 * Failure is silent by design - completion is an enhancement, and a schema the
 * user cannot introspect should not put an error on a page that still runs
 * queries perfectly well.
 */
export function useSqlSchema(
  connectionId: string,
  currentDatabase?: string | null
): SQLNamespace | undefined {
  const [schema, setSchema] = React.useState<SQLNamespace | undefined>(undefined)

  React.useEffect(() => {
    if (!connectionId) {
      setSchema(undefined)
      return
    }
    let isCurrent = true

    async function load() {
      try {
        const schemas = await unwrap(window.api.db.listSchemas(connectionId))
        if (!isCurrent || schemas.length === 0) return

        const names = schemasToLoad(
          schemas.map((s) => s.name),
          currentDatabase
        )
        const graphs = await Promise.all(
          names.map(async (name) => {
            try {
              return await unwrap(window.api.db.schemaGraph(connectionId, name))
            } catch {
              return null
            }
          })
        )
        if (!isCurrent) return

        const usable = graphs.filter((graph): graph is SchemaGraph => graph != null)
        if (usable.length === 0) return
        // The first name is the schema whose tables are written unqualified:
        // `public` on Postgres, the database on MySQL.
        setSchema(buildSqlSchema(usable, names[0]))
      } catch {
        // Completion stays off; the editor still works.
      }
    }

    void load()
    return () => {
      isCurrent = false
    }
  }, [connectionId, currentDatabase])

  return schema
}

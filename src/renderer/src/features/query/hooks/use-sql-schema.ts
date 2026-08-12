import * as React from 'react'
import type { SQLNamespace } from '@codemirror/lang-sql'
import { unwrap } from '@renderer/lib/ipc'
import type { SchemaGraph } from '@renderer/types'
import { buildSqlSchema } from '../lib/sql-completion'

/**
 * More than this and the completion list stops being a list. Loading them all
 * would also mean one round-trip per schema against a database that evidently
 * has a lot going on.
 */
const MAX_SCHEMAS = 5

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
export function useSqlSchema(connectionId: string): SQLNamespace | undefined {
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

        const names = schemas.slice(0, MAX_SCHEMAS).map((s) => s.name)
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
        // The first schema the engine reports is the one whose tables are
        // written unqualified: `public` on Postgres, the database on MySQL.
        setSchema(buildSqlSchema(usable, names[0]))
      } catch {
        // Completion stays off; the editor still works.
      }
    }

    void load()
    return () => {
      isCurrent = false
    }
  }, [connectionId])

  return schema
}

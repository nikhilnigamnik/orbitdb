/**
 * Cascade delete. The replan runs inside the transaction, behind a lock on the
 * target rows.
 */

import {
  type CascadeDeleteOptions,
  type CascadeDeletePlan,
  type CascadeDeleteResult
} from '../../../../shared/types'
import {
  lockStatements,
  planCascadeDelete,
  rootTuples,
  toCascadeResult,
  type CascadeDeleteDeps
} from '../../cascade-delete'
import { searchDialect } from './dialect'
import { referencingKeys, tableDetails } from './introspect'
import { getPool, loggedQuery } from './pool'

type CascadeSelect = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>
function cascadeDeps(connectionId: string, select: CascadeSelect): CascadeDeleteDeps {
  return {
    dialect: searchDialect,
    referencingKeys: (schema, table) => referencingKeys(connectionId, schema, table),
    select
  }
}
async function primaryKeyOf(opts: CascadeDeleteOptions): Promise<string[]> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (details.primaryKey.length === 0) {
    throw new Error(`Cannot delete rows on ${opts.schema}.${opts.table}: no primary key`)
  }
  return details.primaryKey
}
export async function cascadeDeletePlan(opts: CascadeDeleteOptions): Promise<CascadeDeletePlan> {
  const pkColumns = await primaryKeyOf(opts)
  const pool = await getPool(opts.connectionId)
  const { plan } = await planCascadeDelete(
    opts.schema,
    opts.table,
    pkColumns,
    rootTuples(opts.schema, opts.table, pkColumns, opts.pks),
    cascadeDeps(opts.connectionId, async (sql, params) => (await pool.query(sql, params)).rows)
  )
  return plan
}
/**
 * Replanned rather than handed the preview's statements: the plan crosses IPC
 * without its bound values (they can be thousands), and a row inserted between
 * the preview and the confirm has to be caught by the walk rather than left
 * behind to fail the delete.
 *
 * The replan runs *inside* the transaction, on the connection that holds it, and
 * behind a `for update` on the target rows. Planning on a pooled connection
 * first left every count outside the transaction, so a child row inserted after
 * the last one was in no bound list and failed the parent delete - rolling back
 * every dependent delete already issued alongside it. It replans without
 * counting: the counts were for the preview, and here they would only hold the
 * locks longer.
 *
 * Every statement goes through `loggedQuery`, since a client checked out of the
 * pool is not covered by the pool's own query log.
 */
export async function cascadeDelete(opts: CascadeDeleteOptions): Promise<CascadeDeleteResult> {
  const pkColumns = await primaryKeyOf(opts)
  // Resolved before a client is taken: an all-NULL key list used to reach the
  // lock as `where ("id" in ()) for update`, a syntax error from inside the
  // transaction in place of the planner's own message.
  const rootValues = rootTuples(opts.schema, opts.table, pkColumns, opts.pks)
  const pool = await getPool(opts.connectionId)
  const client = await pool.connect()
  const run = loggedQuery(client, opts.connectionId)
  try {
    await run('begin')
    const deps = cascadeDeps(
      opts.connectionId,
      async (sql, params) => (await run(sql, params)).rows
    )
    for (const lock of lockStatements(deps, opts.schema, opts.table, pkColumns, rootValues)) {
      await run(lock.sql, lock.params)
    }
    const { statements } = await planCascadeDelete(
      opts.schema,
      opts.table,
      pkColumns,
      rootValues,
      deps,
      { shouldCount: false }
    )
    const affected: { schema: string; table: string; rows: number }[] = []
    for (const statement of statements) {
      const res = await run(statement.sql, statement.params)
      affected.push({
        schema: statement.schema,
        table: statement.table,
        rows: res.rowCount ?? 0
      })
    }
    await run('commit')
    return toCascadeResult(affected, true)
  } catch (err) {
    await run('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

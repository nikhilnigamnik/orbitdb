/**
 * Cascade delete. The replan runs inside the transaction, behind a lock on the
 * target rows.
 */

import { type RowDataPacket, type ResultSetHeader } from 'mysql2/promise'
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
    cascadeDeps(opts.connectionId, async (sql, params) => {
      const [rows] = await pool.query<RowDataPacket[]>(sql, params)
      return rows as Record<string, unknown>[]
    })
  )
  return plan
}
/**
 * Replanned rather than handed the preview's statements: the plan crosses IPC
 * without its bound values, and a row inserted between the preview and the
 * confirm has to be caught by the walk rather than left behind to fail the
 * delete.
 *
 * The rollback only holds on a transactional engine - MyISAM tables commit as
 * they go, and they have no foreign keys to cascade in the first place.
 *
 * The replan runs *inside* the transaction, behind a `for update` on the target
 * rows, so a child inserted after the walk counted its parent cannot slip past
 * the bound lists and fail the delete. It replans without counting: the counts
 * were for the preview, and here they would only hold the locks longer.
 *
 * Every statement goes through `loggedQuery`, since a connection checked out
 * of the pool is not covered by the pool's own query log.
 */
export async function cascadeDelete(opts: CascadeDeleteOptions): Promise<CascadeDeleteResult> {
  const pkColumns = await primaryKeyOf(opts)
  // Resolved before a connection is taken: an all-NULL key list used to reach
  // the lock as `where (`id` in ()) for update`, a syntax error from inside the
  // transaction in place of the planner's own message.
  const rootValues = rootTuples(opts.schema, opts.table, pkColumns, opts.pks)
  const pool = await getPool(opts.connectionId)
  const conn = await pool.getConnection()
  const run = loggedQuery(conn, opts.connectionId)
  try {
    await run('start transaction')
    const deps = cascadeDeps(opts.connectionId, async (sql, params) => {
      const [rows] = await run<RowDataPacket[]>(sql, params)
      return rows as Record<string, unknown>[]
    })
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
      const [result] = await run<ResultSetHeader>(statement.sql, statement.params)
      affected.push({
        schema: statement.schema,
        table: statement.table,
        rows: result.affectedRows ?? 0
      })
    }
    await run('commit')
    return toCascadeResult(affected, true)
  } catch (err) {
    await run('rollback').catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

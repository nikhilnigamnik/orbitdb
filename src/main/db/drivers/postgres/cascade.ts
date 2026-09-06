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
  toCascadeResult,
  toPkTuples,
  type CascadeDeleteDeps,
  type CascadePlanResult
} from '../../cascade-delete'
import { searchDialect } from './dialect'
import { referencingKeys, tableDetails } from './introspect'
import { getPool } from './pool'

type CascadeSelect = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>
function cascadeDeps(connectionId: string, select: CascadeSelect): CascadeDeleteDeps {
  return {
    dialect: searchDialect,
    referencingKeys: (schema, table) => referencingKeys(connectionId, schema, table),
    select
  }
}
/**
 * `select` is threaded in so the delete can run the walk on the connection that
 * holds its transaction. Reading the plan on a pooled connection and then
 * opening the transaction on another left every count outside it.
 */
async function planCascade(
  opts: CascadeDeleteOptions,
  select?: CascadeSelect
): Promise<CascadePlanResult> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (details.primaryKey.length === 0) {
    throw new Error(`Cannot delete rows on ${opts.schema}.${opts.table}: no primary key`)
  }
  let run = select
  if (!run) {
    const pool = await getPool(opts.connectionId)
    run = async (sql, params) => (await pool.query(sql, params)).rows
  }
  return planCascadeDelete(
    opts.schema,
    opts.table,
    details.primaryKey,
    toPkTuples(details.primaryKey, opts.pks),
    cascadeDeps(opts.connectionId, run)
  )
}
export async function cascadeDeletePlan(opts: CascadeDeleteOptions): Promise<CascadeDeletePlan> {
  return (await planCascade(opts)).plan
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
 * every dependent delete already issued alongside it.
 */
export async function cascadeDelete(opts: CascadeDeleteOptions): Promise<CascadeDeleteResult> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (details.primaryKey.length === 0) {
    throw new Error(`Cannot delete rows on ${opts.schema}.${opts.table}: no primary key`)
  }
  const pool = await getPool(opts.connectionId)
  const client = await pool.connect()
  try {
    await client.query('begin')
    const select: CascadeSelect = async (sql, params) => (await client.query(sql, params)).rows
    for (const lock of lockStatements(
      searchDialect,
      opts.schema,
      opts.table,
      details.primaryKey,
      toPkTuples(details.primaryKey, opts.pks)
    )) {
      await client.query(lock.sql, lock.params)
    }
    const { statements } = await planCascade(opts, select)
    const affected: { schema: string; table: string; rows: number }[] = []
    for (const statement of statements) {
      const res = await client.query(statement.sql, statement.params)
      affected.push({
        schema: statement.schema,
        table: statement.table,
        rows: res.rowCount ?? 0
      })
    }
    await client.query('commit')
    return toCascadeResult(affected, true)
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

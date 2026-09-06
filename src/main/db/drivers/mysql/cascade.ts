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
    run = async (sql, params) => {
      const [rows] = await pool.query<RowDataPacket[]>(sql, params)
      return rows as Record<string, unknown>[]
    }
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
 * without its bound values, and a row inserted between the preview and the
 * confirm has to be caught by the walk rather than left behind to fail the
 * delete.
 *
 * The rollback only holds on a transactional engine - MyISAM tables commit as
 * they go, and they have no foreign keys to cascade in the first place.
 *
 * The replan runs *inside* the transaction, behind a `for update` on the target
 * rows, so a child inserted after the walk counted its parent cannot slip past
 * the bound lists and fail the delete.
 */
export async function cascadeDelete(opts: CascadeDeleteOptions): Promise<CascadeDeleteResult> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (details.primaryKey.length === 0) {
    throw new Error(`Cannot delete rows on ${opts.schema}.${opts.table}: no primary key`)
  }
  const pool = await getPool(opts.connectionId)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const select: CascadeSelect = async (sql, params) => {
      const [rows] = await conn.query<RowDataPacket[]>(sql, params)
      return rows as Record<string, unknown>[]
    }
    for (const lock of lockStatements(
      searchDialect,
      opts.schema,
      opts.table,
      details.primaryKey,
      toPkTuples(details.primaryKey, opts.pks)
    )) {
      await conn.query(lock.sql, lock.params)
    }
    const { statements } = await planCascade(opts, select)
    const affected: { schema: string; table: string; rows: number }[] = []
    for (const statement of statements) {
      const [result] = await conn.query<ResultSetHeader>(statement.sql, statement.params)
      affected.push({
        schema: statement.schema,
        table: statement.table,
        rows: result.affectedRows ?? 0
      })
    }
    await conn.commit()
    return toCascadeResult(affected, true)
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

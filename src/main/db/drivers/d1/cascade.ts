/**
 * Cascade delete: one REST request per statement, and therefore not atomic.
 */

import {
  D1_MAX_BOUND_PARAMS,
  type CascadeDeleteOptions,
  type CascadeDeletePlan,
  type CascadeDeleteResult,
  type SavedConnection
} from '../../../../shared/types'
import {
  planCascadeDelete,
  rootTuples,
  toCascadeResult,
  type CascadeDeleteDeps,
  type CascadePlanOptions,
  type CascadePlanResult
} from '../../cascade-delete'
import { callD1, loadSaved, searchDialect } from './client'
import { referencingKeys, tableDetails } from './introspect'

function cascadeDeps(saved: SavedConnection, connectionId: string): CascadeDeleteDeps {
  return {
    dialect: searchDialect,
    // Past this D1 rejects the statement outright, and the planner's per-key
    // catch then recorded a failure and left the whole subtree out of the plan.
    maxBindParams: D1_MAX_BOUND_PARAMS,
    referencingKeys: (schema, table) => referencingKeys(connectionId, schema, table),
    select: async (sql, params) => (await callD1(saved, sql, params)).results
  }
}
async function planCascade(
  opts: CascadeDeleteOptions,
  options?: CascadePlanOptions
): Promise<CascadePlanResult> {
  const saved = loadSaved(opts.connectionId)
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (details.primaryKey.length === 0) {
    throw new Error(`Cannot delete rows on ${opts.table}: no primary key`)
  }
  return planCascadeDelete(
    opts.schema,
    opts.table,
    details.primaryKey,
    rootTuples(opts.schema, opts.table, details.primaryKey, opts.pks),
    cascadeDeps(saved, opts.connectionId),
    options
  )
}
export async function cascadeDeletePlan(opts: CascadeDeleteOptions): Promise<CascadeDeletePlan> {
  return (await planCascade(opts)).plan
}
/**
 * Sequential and **not** atomic, unlike the other two drivers.
 *
 * The REST query endpoint is one statement per request, so there is no
 * connection to hold a transaction open across. A statement that fails
 * therefore leaves the deletes before it committed - `wasAtomic: false` is how
 * the result says so, rather than letting the caller assume all-or-nothing.
 *
 * Deepest-first ordering makes that far less likely to matter: the deletes that
 * could still be refused are the last ones, so a failure usually means the
 * dependents went and the target row did not.
 *
 * The replan skips the counts: they were for the preview, and here each one is
 * a REST round trip that decides nothing.
 */
export async function cascadeDelete(opts: CascadeDeleteOptions): Promise<CascadeDeleteResult> {
  const saved = loadSaved(opts.connectionId)
  const { statements } = await planCascade(opts, { shouldCount: false })
  const affected: { schema: string; table: string; rows: number }[] = []
  for (const statement of statements) {
    try {
      const entry = await callD1(saved, statement.sql, statement.params)
      affected.push({
        schema: statement.schema,
        table: statement.table,
        rows: entry.meta.changes ?? 0
      })
    } catch (err) {
      // There is no transaction to roll back, so the statements before this one
      // are committed and their rows are gone. Saying so is the whole point of
      // `wasAtomic: false`; a bare failure would read as "nothing happened".
      const done = toCascadeResult(affected, false).totalRows
      const message = err instanceof Error ? err.message : String(err)
      if (done === 0) throw err
      throw new Error(
        `${message} - D1 runs one statement per request, so the ${done} row${
          done === 1 ? '' : 's'
        } already deleted could not be rolled back.`
      )
    }
  }
  return toCascadeResult(affected, false)
}

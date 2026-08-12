import {
  REFERENCE_CHECK_PAIR_LIMIT,
  type BrokenReference,
  type CheckReferencesResult,
  type ColumnInfo,
  type TableDetails
} from '../../shared/types'
import type { ValueSearchDialect } from './value-search'

/**
 * Finding rows that point at parents which are not there.
 *
 * Two kinds of reference are checked, and both earn their place. An undeclared
 * one - `posts.author_id` with no constraint behind it - is where orphans
 * usually come from. A *declared* one should be impossible to break, but SQLite
 * ships with `foreign_keys` off (so D1 does), and MySQL's older engines accept
 * the syntax and ignore it, which makes "the constraint exists" worth verifying
 * rather than trusting.
 */

export interface RefCandidate {
  table: string
  column: string
  referencedTable: string
  referencedColumn: string
  isDeclared: boolean
}

function typeKey(column: ColumnInfo): string {
  return (column.udtName || column.dataType)
    .toLowerCase()
    .replace(/\(.*\)$/, '')
    .trim()
}

/**
 * Table names a `<base>_id` column might be pointing at.
 *
 * Deliberately naive - exact, plural, and the `-y` to `-ies` case - because it
 * only ever proposes: nothing is reported unless a table with that name really
 * exists *and* the column types line up. A miss costs a reference we do not
 * check; a wrong guess would cost a join across two unrelated tables.
 */
export function referencedNameGuesses(base: string): string[] {
  const guesses = [base, `${base}s`]
  if (base.endsWith('y')) guesses.push(`${base.slice(0, -1)}ies`)
  if (base.endsWith('s')) guesses.push(base.slice(0, -1))
  return guesses
}

/** `author_id` and `authorId` both yield `author`. Anything else yields null. */
export function foreignKeyBase(column: string): string | null {
  const snake = column.match(/^(.+)_id$/i)
  if (snake) return snake[1].toLowerCase()
  const camel = column.match(/^(.+)Id$/)
  if (camel) return camel[1].toLowerCase()
  return null
}

/**
 * Every reference worth checking across the schema.
 *
 * Declared foreign keys first, then name-inferred ones for columns no
 * constraint already covers - reporting the same column twice would double the
 * work and read as two separate problems.
 *
 * Only single-column references are considered. A composite key needs a join on
 * every part at once, and the inference has nothing to go on for those.
 */
export function inferCandidates(tables: TableDetails[]): RefCandidate[] {
  const byName = new Map<string, TableDetails>()
  for (const table of tables) byName.set(table.name.toLowerCase(), table)

  const candidates: RefCandidate[] = []

  for (const table of tables) {
    const covered = new Set<string>()

    for (const fk of table.foreignKeys) {
      if (fk.columns.length !== 1 || fk.referencedColumns.length !== 1) continue
      covered.add(fk.columns[0])
      candidates.push({
        table: table.name,
        column: fk.columns[0],
        referencedTable: fk.referencedTable,
        referencedColumn: fk.referencedColumns[0],
        isDeclared: true
      })
    }

    for (const column of table.columns) {
      if (covered.has(column.name)) continue
      const base = foreignKeyBase(column.name)
      if (!base) continue

      // `parent_id` names a relationship rather than a table, and it is the
      // commonest self-reference there is - a tree of categories, comments or
      // folders. Its own table is tried last, so a real `parents` table still
      // wins if one exists.
      const guesses = referencedNameGuesses(base)
      if (base === 'parent') guesses.push(table.name.toLowerCase())

      for (const guess of guesses) {
        const parent = byName.get(guess)
        if (!parent || parent.primaryKey.length !== 1) continue
        const parentPk = parent.columns.find((c) => c.name === parent.primaryKey[0])
        // Types have to line up. Without this, `user_id integer` would be joined
        // against `users.id uuid`, which Postgres rejects outright and SQLite
        // silently answers "every row is an orphan".
        if (!parentPk || typeKey(parentPk) !== typeKey(column)) continue
        candidates.push({
          table: table.name,
          column: column.name,
          referencedTable: parent.name,
          referencedColumn: parentPk.name,
          isDeclared: false
        })
        break
      }
    }
  }

  return candidates
}

/**
 * Declared references first, then the rest.
 *
 * A declared constraint that is broken is the more alarming finding - it means
 * the database is not enforcing something it claims to - so when the cap bites
 * it should not be the thing that gets dropped.
 */
export function orderCandidates(candidates: RefCandidate[]): {
  checked: RefCandidate[]
  skipped: number
} {
  const sorted = [...candidates].sort((a, b) => {
    if (a.isDeclared !== b.isDeclared) return a.isDeclared ? -1 : 1
    return a.table.localeCompare(b.table) || a.column.localeCompare(b.column)
  })
  return {
    checked: sorted.slice(0, REFERENCE_CHECK_PAIR_LIMIT),
    skipped: Math.max(0, sorted.length - REFERENCE_CHECK_PAIR_LIMIT)
  }
}

/**
 * Rows whose reference has no parent.
 *
 * A left join with `is null` rather than `not exists`: the three engines all
 * plan it well, and it reads the way the question is asked. NULL on the child
 * is skipped - an absent reference is not a broken one, which is the same rule
 * `referencing.ts` applies when it declines to link on a NULL.
 *
 * No parameters: nothing here is user input. Every identifier comes from the
 * engine's own catalogue and is quoted by the dialect.
 */
export function buildOrphanSql(
  dialect: ValueSearchDialect,
  schema: string,
  candidate: RefCandidate
): string {
  const child = dialect.qualifiedTable(schema, candidate.table)
  const parent = dialect.qualifiedTable(schema, candidate.referencedTable)
  const childCol = `c.${dialect.quoteIdent(candidate.column)}`
  const parentCol = `p.${dialect.quoteIdent(candidate.referencedColumn)}`
  return (
    `select count(*) as broken from ${child} c ` +
    `left join ${parent} p on ${parentCol} = ${childCol} ` +
    `where ${childCol} is not null and ${parentCol} is null`
  )
}

export function toBrokenCount(row: Record<string, unknown> | undefined): number {
  const raw = row?.broken
  if (raw === null || raw === undefined) return 0
  const count = Number(raw)
  return Number.isFinite(count) ? count : 0
}

export interface ReferenceSweepDeps {
  dialect: ValueSearchDialect
  /** Details for every table in the schema, which is what inference needs. */
  loadTables(): Promise<TableDetails[]>
  run(sql: string): Promise<Record<string, unknown> | undefined>
  isCancelled(): boolean
}

/**
 * One join per candidate, run one at a time.
 *
 * Each of these reads two whole tables, so this is heavier than the value
 * search - all the more reason not to fire them concurrently. A pair that fails
 * is recorded and the sweep continues.
 */
export async function sweepReferences(
  schema: string,
  deps: ReferenceSweepDeps
): Promise<CheckReferencesResult> {
  const candidates = inferCandidates(await deps.loadTables())
  const { checked, skipped } = orderCandidates(candidates)

  const broken: BrokenReference[] = []
  const failures: { table: string; error: string }[] = []
  let pairsChecked = 0
  let wasCancelled = false

  for (const candidate of checked) {
    if (deps.isCancelled()) {
      wasCancelled = true
      break
    }
    try {
      const row = await deps.run(buildOrphanSql(deps.dialect, schema, candidate))
      pairsChecked += 1
      const count = toBrokenCount(row)
      if (count > 0) broken.push({ schema, ...candidate, count })
    } catch (err) {
      failures.push({
        table: `${candidate.table}.${candidate.column}`,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  // Declared breaks first even when smaller: a constraint the database is not
  // enforcing is a worse finding than a large pile of orphans nobody promised
  // to prevent.
  broken.sort((a, b) => {
    if (a.isDeclared !== b.isDeclared) return a.isDeclared ? -1 : 1
    return b.count - a.count || a.table.localeCompare(b.table)
  })

  return {
    broken,
    pairsChecked,
    pairsSkipped: skipped,
    pairsFound: candidates.length,
    failures,
    wasCancelled
  }
}

import { editableEnumValues, isBoolType } from './cell-value'
import type { ColumnInfo } from '@renderer/types'

/**
 * Types a "in the last 7 days" suggestion makes sense against. `time`/`timetz`
 * are deliberately absent - a bare time of day has no date to count back from.
 *
 * D1/SQLite normalises every declared type down to json/bool/int4/float8/text
 * (see `sqlite-shared.ts`), so no column there matches and the generic fallbacks
 * carry the list instead.
 */
const TEMPORAL_TYPES = new Set(['timestamptz', 'timestamp', 'datetime', 'date'])

/**
 * Phrasings that need no column knowledge - sorting alone answers them. Used to
 * back-fill a table that yields too few of its own, but deliberately short: a
 * suggestion the table cannot actually answer is worse than an empty slot, so
 * the dialog renders two rather than three rather than carry filler.
 */
const GENERIC = ['most recent 100 rows', 'the 20 oldest rows']

const MAX_SUGGESTIONS = 3

function isTemporalType(udt: string): boolean {
  return TEMPORAL_TYPES.has(udt)
}

/**
 * Example prompts drawn from the table actually on screen.
 *
 * The point is that every suggestion is answerable: an enum's label comes from
 * introspection, so "action is Update" names a value the column really holds -
 * where the old hardcoded "where status is active" was nonsense on any table
 * without a `status` column, which is most of them.
 *
 * Only `ColumnInfo` is consulted, so this stays synchronous and costs no query.
 * That is also its limit: it can suggest a value for an enum, whose domain is
 * known, but not for free text, whose values live in the rows.
 */
export function buildFilterSuggestions(columns: ColumnInfo[]): string[] {
  const enums: string[] = []
  const temporal: string[] = []
  const booleans: string[] = []
  const text: string[] = []

  for (const c of columns) {
    const labels = editableEnumValues(c)
    if (labels) {
      enums.push(`${c.name} is ${labels[0]}`)
      continue
    }
    if (isTemporalType(c.udtName)) {
      temporal.push(`${c.name} in the last 7 days`)
      continue
    }
    if (isBoolType(c.udtName)) {
      booleans.push(`${c.name} is true`)
      continue
    }
    // A primary key is unique by definition, so "is not empty" tells you nothing.
    if (c.udtName === 'text' && !c.isPrimaryKey && c.isNullable) {
      text.push(`${c.name} is not empty`)
    }
  }

  // Round-robin rather than draining one bucket: a table with six enums should
  // still offer a date and a boolean example, not six variations of the same shape.
  const buckets = [enums, temporal, booleans, text]
  const picked: string[] = []
  for (let i = 0; picked.length < MAX_SUGGESTIONS; i += 1) {
    const available = buckets.filter((b) => b.length > i)
    if (available.length === 0) break
    for (const bucket of available) {
      if (picked.length >= MAX_SUGGESTIONS) break
      picked.push(bucket[i])
    }
  }

  for (const generic of GENERIC) {
    if (picked.length >= MAX_SUGGESTIONS) break
    picked.push(generic)
  }

  return picked
}

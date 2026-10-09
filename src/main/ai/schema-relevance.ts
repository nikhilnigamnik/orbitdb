import type { SchemaGraphEdge, SchemaGraphTable } from '../../shared/types'

/**
 * Column names nearly every table has. A query mentioning `created_at` says
 * nothing about which table it means, and letting it score would spread the
 * same few points across the whole schema.
 */
const GENERIC_COLUMNS = new Set([
  'id',
  'name',
  'title',
  'type',
  'status',
  'description',
  'created_at',
  'updated_at',
  'deleted_at',
  'createdat',
  'updatedat',
  'deletedat'
])

/** A table named outright - in SQL, or as a word in the request. */
const NAMED_SCORE = 100
/** Named in the other number: "patient" for `patients`, "categories" for `category`. */
const VARIANT_SCORE = 60
/** One word of a compound name: "dispense" for `dispense_items`. */
const PART_SCORE = 15
/** A distinctive column the request mentions. Capped, so columns never outrank a name. */
const COLUMN_SCORE = 4
const MAX_COLUMN_SCORE = 12
/** A table joined to one that was named; a join needs both sides in the map. */
const NEIGHBOUR_SCORE = 30

function tokens(text: string): Set<string> {
  const out = new Set<string>()
  const words = text.toLowerCase().match(/[a-z0-9_.]+/g) ?? []
  for (const word of words) {
    out.add(word)
    // schema.table and snake_case both name smaller things worth matching.
    for (const part of word.split(/[._]/)) if (part) out.add(part)
  }
  // "revenue targets" in a request is `revenue_targets` in the schema. Runs of
  // up to three words are joined the way table names are written.
  for (let i = 0; i < words.length; i++) {
    for (let n = 2; n <= 3 && i + n <= words.length; n++) {
      out.add(words.slice(i, i + n).join('_'))
    }
  }
  return out
}

/** The word itself, plus its plural and singular - enough for table names. */
export function nameVariants(word: string): string[] {
  const out = new Set([word])
  if (word.endsWith('ies') && word.length > 4) out.add(`${word.slice(0, -3)}y`)
  else if (/(sses|xes|ches|shes)$/.test(word)) out.add(word.slice(0, -2))
  // "status", "analysis", "address" end in s without being plurals.
  else if (word.endsWith('s') && !/(ss|us|is)$/.test(word) && word.length > 3) {
    out.add(word.slice(0, -1))
  }
  if (/[^aeiou]y$/.test(word)) out.add(`${word.slice(0, -1)}ies`)
  else if (/(s|x|ch|sh)$/.test(word)) out.add(`${word}es`)
  else out.add(`${word}s`)
  return [...out]
}

function key(schema: string, table: string): string {
  return `${schema}.${table}`.toLowerCase()
}

/**
 * Picks which tables a model is shown when a database has more than it can be
 * sent. Without this the cut was simply the first `limit` in catalogue order -
 * roughly alphabetical - so on a 110-table schema a question about `users` got
 * "that table does not exist" because it sorted 80th.
 *
 * Deliberately lexical: the request and the SQL name tables far more often than
 * not, and this runs before every call, so it must cost nothing. With no focus
 * every score is zero and the first `limit` are kept, as before. The result is
 * in the original order, which keeps a schema's tables together for the model.
 */
export function selectRelevantTables(
  tables: SchemaGraphTable[],
  edges: SchemaGraphEdge[],
  focus: string,
  limit: number
): SchemaGraphTable[] {
  if (tables.length <= limit) return tables
  const words = tokens(focus)
  if (words.size === 0) return tables.slice(0, limit)

  const scores = new Map<string, number>()
  for (const table of tables) {
    const name = table.name.toLowerCase()
    let score = 0
    if (words.has(name) || words.has(key(table.schema, table.name))) score = NAMED_SCORE
    else if (nameVariants(name).some((v) => words.has(v))) score = VARIANT_SCORE
    else {
      const parts = name.split('_').filter((part) => part.length >= 3)
      for (const part of parts) {
        if (nameVariants(part).some((v) => words.has(v))) score += PART_SCORE
      }
    }

    let columnScore = 0
    for (const column of table.columns) {
      const columnName = column.name.toLowerCase()
      if (columnName.length >= 4 && !GENERIC_COLUMNS.has(columnName) && words.has(columnName)) {
        columnScore += COLUMN_SCORE
      }
    }
    scores.set(key(table.schema, table.name), score + Math.min(columnScore, MAX_COLUMN_SCORE))
  }

  // Named tables pull in what they join to, in either direction.
  const named = new Set([...scores].filter(([, s]) => s >= VARIANT_SCORE).map(([k]) => k))
  for (const edge of edges) {
    const from = key(edge.from.schema, edge.from.table)
    const to = key(edge.to.schema, edge.to.table)
    for (const [side, other] of [
      [from, to],
      [to, from]
    ]) {
      if (named.has(side) && scores.has(other)) {
        scores.set(other, Math.max(scores.get(other) ?? 0, NEIGHBOUR_SCORE))
      }
    }
  }

  const chosen = new Set(
    tables
      .map((table, index) => ({ index, score: scores.get(key(table.schema, table.name)) ?? 0 }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, limit)
      .map(({ index }) => index)
  )
  return tables.filter((_, index) => chosen.has(index))
}

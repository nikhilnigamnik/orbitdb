/** Leading `--` line comments and `/* *\/` block comments, repeated. */
const LEADING_COMMENTS = /^(?:\s*(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/))+/

/**
 * The first keyword of a statement — used as the `command` label on query
 * results. Leading comments are skipped so a commented-out header doesn't turn
 * `SELECT` into `--`.
 */
export function detectCommand(sql: string): string | null {
  const body = sql.replace(LEADING_COMMENTS, '').trim()
  const first = body.split(/\s+/)[0]
  return first ? first.toUpperCase() : null
}

const SCHEMA_CHANGING = /\b(?:alter|create|drop|rename|truncate|comment)\b/i

/**
 * Whether `sql` might change the schema, so cached table details have to go.
 * Deliberately loose — it scans the whole string rather than just the leading
 * keyword, since a multi-statement batch can hide the DDL after an INSERT. A
 * false positive only costs a cache refill.
 */
export function isSchemaChanging(sql: string): boolean {
  return SCHEMA_CHANGING.test(sql)
}

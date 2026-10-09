/** Leading `--` line comments and `/* *\/` block comments, repeated. */
const LEADING_COMMENTS = /^(?:\s*(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/))+/

/**
 * The first keyword of a statement - used as the `command` label on query
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
 * The editor keeps its own session, so DDL can sit in an open transaction that
 * the pooled connections introspecting the schema cannot see yet. The cache is
 * dropped at the DDL and refilled with the old shape; the commit is the moment
 * the new one becomes visible, so it has to drop the cache again.
 */
const TRANSACTION_END = /\bcommit\b|(?:^|;)\s*end\s*(?:work|transaction)?\s*(?:;|$)/i

/**
 * Whether `sql` might change the schema, so cached table details have to go.
 * Deliberately loose - it scans the whole string rather than just the leading
 * keyword, since a multi-statement batch can hide the DDL after an INSERT. A
 * false positive only costs a cache refill.
 */
export function isSchemaChanging(sql: string): boolean {
  return SCHEMA_CHANGING.test(sql) || TRANSACTION_END.test(sql)
}

const DOLLAR_QUOTE_TAG = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/
const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/

/** Index just past the quote that closes the one opening at `start`. */
function skipQuoted(
  sql: string,
  start: number,
  quote: string,
  hasBackslashEscapes: boolean
): number {
  let i = start + 1
  while (i < sql.length) {
    const ch = sql[i]
    if (hasBackslashEscapes && ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) {
      // A doubled quote is an escaped one, not the end.
      if (sql[i + 1] === quote) {
        i += 2
        continue
      }
      return i + 1
    }
    i += 1
  }
  return sql.length
}

/** Index just past the end of a comment starting at `start`, or -1 when none does. */
function skipComment(sql: string, start: number): number {
  if (sql.startsWith('--', start)) {
    const newline = sql.indexOf('\n', start)
    return newline === -1 ? sql.length : newline + 1
  }
  if (!sql.startsWith('/*', start)) return -1
  // Postgres nests block comments.
  let depth = 0
  let i = start
  while (i < sql.length) {
    if (sql.startsWith('/*', i)) {
      depth += 1
      i += 2
    } else if (sql.startsWith('*/', i)) {
      depth -= 1
      i += 2
      if (depth === 0) return i
    } else {
      i += 1
    }
  }
  return sql.length
}

/**
 * Whether `sql` holds more than one statement. Postgres' extended protocol - the
 * one a cursor needs - refuses a batch outright, so a batch has to take the
 * simple protocol instead. Quotes, dollar quotes and comments are skipped so a
 * semicolon inside one is not mistaken for a separator; a trailing semicolon,
 * or a run of them, still counts as one statement.
 */
export function hasMultipleStatements(sql: string): boolean {
  let hasTerminator = false
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    const commentEnd = skipComment(sql, i)
    if (commentEnd !== -1) {
      i = commentEnd
      continue
    }
    if (/\s/.test(ch) || ch === ';') {
      if (ch === ';') hasTerminator = true
      i += 1
      continue
    }
    if (hasTerminator) return true
    const prev = i > 0 ? sql[i - 1] : ''
    if (ch === "'") {
      const isEscapeString =
        (prev === 'E' || prev === 'e') && !IDENTIFIER_CHAR.test(i > 1 ? sql[i - 2] : '')
      i = skipQuoted(sql, i, "'", isEscapeString)
      continue
    }
    if (ch === '"' || ch === '`') {
      i = skipQuoted(sql, i, ch, false)
      continue
    }
    if (ch === '$' && !IDENTIFIER_CHAR.test(prev)) {
      const tag = DOLLAR_QUOTE_TAG.exec(sql.slice(i))?.[0]
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length)
        i = close === -1 ? sql.length : close + tag.length
        continue
      }
    }
    i += 1
  }
  return false
}

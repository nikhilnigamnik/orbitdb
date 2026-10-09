import { MAX_SQL_CHARS } from './config'
import { asData } from './context'

/**
 * The editor's SQL, fenced as data like every other piece of user content, and
 * cut at `MAX_SQL_CHARS` with a note saying so - a model shown half a query
 * without being told would "fix" the missing half.
 */
export function sqlAsData(tag: string, sql: string): string {
  const trimmed = sql.trim()
  if (trimmed.length <= MAX_SQL_CHARS) return asData(tag, trimmed)
  return (
    asData(tag, trimmed.slice(0, MAX_SQL_CHARS)) +
    `\n(Only the first ${MAX_SQL_CHARS} characters of the query are shown.)`
  )
}

/** Whitespace and case aside, is this the same query? */
export function isSameSql(a: string, b: string): boolean {
  const normalise = (sql: string) => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '').toLowerCase()
  return normalise(a) === normalise(b)
}

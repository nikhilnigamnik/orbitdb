import type { SavedQuery } from '@renderer/types'

export interface QueryGroups {
  /** Kept on purpose. Never pruned, and the only ones that can carry a name. */
  saved: SavedQuery[]
  /** Everything else, newest first, subject to the store's per-connection cap. */
  recent: SavedQuery[]
}

export function groupQueries(queries: SavedQuery[]): QueryGroups {
  return {
    saved: queries.filter((q) => q.isStarred),
    recent: queries.filter((q) => !q.isStarred)
  }
}

/**
 * One line of SQL for a title attribute or a name placeholder. Formatted SQL is
 * mostly newlines and indentation, which a single-line slot renders as a run of
 * blank space with the interesting words pushed off the end.
 */
export function collapseSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

/** What to call a query in a list: its name if it has one, else its first line. */
export function queryLabel(query: SavedQuery): string {
  return query.name?.trim() || collapseSql(query.sql)
}

/**
 * Whether the editor holds a statement rather than only comments and blank
 * space. The editor starts out holding a "-- Write SQL here" comment, and
 * "editing" that with AI would be writing a new query under a misleading label.
 */
export function hasSqlBody(sql: string): boolean {
  const withoutComments = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
  return withoutComments.trim() !== ''
}

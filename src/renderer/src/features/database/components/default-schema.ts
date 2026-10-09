/**
 * The schema a database-wide action should run against when the URL names none.
 *
 * Alphabetical order is the wrong tiebreak: it picks `auth` on Supabase and an
 * arbitrary database on a MySQL server. Postgres's conventional schema wins,
 * then the only one there is, then the database the connection was opened on
 * (a MySQL "schema" is a database), and only then the first listed.
 */
export function defaultSchema(schemas: string[], currentDatabase?: string | null): string {
  if (schemas.includes('public')) return 'public'
  if (schemas.length === 1) return schemas[0]
  if (currentDatabase && schemas.includes(currentDatabase)) return currentDatabase
  return schemas[0] ?? ''
}

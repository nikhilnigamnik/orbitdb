/**
 * Spots statements worth stopping the user on before they run.
 *
 * This is a warning, not a security boundary - the user is entitled to run any
 * SQL they like. It exists because the query editor is the one place in the app
 * that will destroy data without asking, while deleting a single row asks twice.
 */

export type DestructiveKind =
  | 'drop'
  | 'truncate'
  | 'delete-without-where'
  | 'update-without-where'
  | 'schema-change'

export interface DestructiveStatement {
  kind: DestructiveKind
  /** What will happen, in the user's terms. */
  summary: string
}

/**
 * Remove comments and string literals so a mention of a keyword inside them -
 * `select 'drop table'` - cannot raise a false alarm.
 */
function stripNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/`(?:[^`]|``)*`/g, '``')
}

/** Split on semicolons, which are already outside literals after stripNoise. */
function statements(sql: string): string[] {
  return stripNoise(sql)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

const TARGET = String.raw`(?:if\s+exists\s+)?([\w."\[\]]+)`

/** The destructive statements in `sql`, in the order they would run. */
export function findDestructiveStatements(sql: string): DestructiveStatement[] {
  const found: DestructiveStatement[] = []

  for (const statement of statements(sql)) {
    const drop = new RegExp(`^drop\\s+(table|database|schema|view|index)\\s+${TARGET}`, 'i').exec(
      statement
    )
    if (drop) {
      found.push({ kind: 'drop', summary: `Drop ${drop[1].toLowerCase()} ${drop[2]}` })
      continue
    }

    const truncate = /^truncate\s+(?:table\s+)?([\w."[\]]+)/i.exec(statement)
    if (truncate) {
      found.push({ kind: 'truncate', summary: `Empty ${truncate[1]}` })
      continue
    }

    const del = /^delete\s+from\s+([\w."[\]]+)([\s\S]*)$/i.exec(statement)
    if (del && !/\bwhere\b/i.test(del[2])) {
      found.push({
        kind: 'delete-without-where',
        summary: `Delete every row in ${del[1]}`
      })
      continue
    }

    const update = /^update\s+([\w."[\]]+)([\s\S]*)$/i.exec(statement)
    if (update && !/\bwhere\b/i.test(update[2])) {
      found.push({
        kind: 'update-without-where',
        summary: `Update every row in ${update[1]}`
      })
      continue
    }

    const alter = /^alter\s+table\s+([\w."[\]]+)[\s\S]*?\bdrop\b/i.exec(statement)
    if (alter) {
      found.push({ kind: 'schema-change', summary: `Drop part of ${alter[1]}` })
    }
  }

  return found
}

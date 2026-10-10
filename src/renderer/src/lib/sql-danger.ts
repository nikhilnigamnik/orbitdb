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
 * Index of the quote that closes the one at `start`, or the last index when it
 * never closes. A doubled quote is always an escape; a backslash is one in
 * MySQL's literals and double-quoted strings, so `'O\'Brien'` stays one literal.
 */
function quotedEnd(text: string, start: number, hasBackslashEscape: boolean): number {
  const quote = text[start]
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\' && hasBackslashEscape) {
      i++
      continue
    }
    if (ch !== quote) continue
    if (text[i + 1] === quote) {
      i++
      continue
    }
    return i
  }
  return text.length - 1
}

/**
 * One left-to-right pass that drops comments, blanks string literals to `''`
 * and splits on the semicolons left outside both. Quoted identifiers are kept
 * as written so the summary can show the table the way the user named it.
 */
function statements(sql: string): string[] {
  const out: string[] = []
  let parts: string[] = []
  let runStart = 0
  let i = 0

  const flushRun = (end: number): void => {
    if (end > runStart) parts.push(sql.slice(runStart, end))
  }

  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]

    // `#` opens a MySQL line comment, but `#>` is Postgres's JSON path operator.
    if ((ch === '-' && next === '-') || (ch === '#' && next !== '>')) {
      flushRun(i)
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
      runStart = i
      parts.push(' ')
      continue
    }

    if (ch === '/' && next === '*') {
      flushRun(i)
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 2
      runStart = i
      parts.push(' ')
      continue
    }

    if (ch === "'") {
      flushRun(i)
      i = quotedEnd(sql, i, true) + 1
      runStart = i
      parts.push("''")
      continue
    }

    if (ch === '"' || ch === '`') {
      i = quotedEnd(sql, i, ch === '"') + 1
      continue
    }

    if (ch === ';') {
      flushRun(i)
      out.push(parts.join(''))
      parts = []
      i++
      runStart = i
      continue
    }

    i++
  }

  flushRun(sql.length)
  out.push(parts.join(''))
  return out.map((s) => s.trim()).filter(Boolean)
}

interface TopLevelToken {
  kind: 'word' | 'group'
  /** The word lowercased, or the text inside a parenthesis group. */
  value: string
  index: number
}

const WORD_START = /[A-Za-z_\u0080-￿]/
const WORD_CHAR = /[\w$\u0080-￿]/

/**
 * The words at parenthesis depth 0 and the bodies of the depth-1 groups, in
 * order. Quoted identifiers are skipped, so a column named "where" is not a
 * WHERE clause.
 */
function topLevelTokens(text: string): TopLevelToken[] {
  const tokens: TopLevelToken[] = []
  let depth = 0
  let groupStart = 0
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (ch === "'" || ch === '"' || ch === '`') {
      i = quotedEnd(text, i, ch !== '`') + 1
      continue
    }

    if (ch === '(') {
      if (depth === 0) groupStart = i + 1
      depth++
      i++
      continue
    }

    if (ch === ')') {
      if (depth === 1) {
        tokens.push({ kind: 'group', value: text.slice(groupStart, i), index: groupStart })
      }
      if (depth > 0) depth--
      i++
      continue
    }

    if (depth === 0 && WORD_START.test(ch)) {
      let end = i + 1
      while (end < text.length && WORD_CHAR.test(text[end])) end++
      tokens.push({ kind: 'word', value: text.slice(i, end).toLowerCase(), index: i })
      i = end
      continue
    }

    i++
  }

  return tokens
}

function hasTopLevelWord(text: string, word: string): boolean {
  return topLevelTokens(text).some((t) => t.kind === 'word' && t.value === word)
}

const BARE_NAME = '[\\w$\\u0080-\\uffff]+'
const DOUBLE_QUOTED = '"(?:[^"\\\\]|\\\\[\\s\\S]|"")*"'
const BACKTICKED = '`(?:[^`]|``)*`'
const BRACKETED = '\\[[^\\]]*\\]'
const NAME = `(?:${DOUBLE_QUOTED}|${BACKTICKED}|${BRACKETED}|${BARE_NAME})`
/** One name as written: quoted or bare, schema-qualified or not. */
const TARGET = `${NAME}(?:\\.${NAME})*`
/** A comma-separated list of targets (MySQL's `t.*` form included), captured as one group. */
const TARGET_LIST = `(${TARGET}(?:\\.\\*)?(?:\\s*,\\s*${TARGET}(?:\\.\\*)?)*)`
const IF_EXISTS = '(?:if\\s+exists\\s+)?'

const DROP_KINDS = [
  'temporary table',
  'temp table',
  'foreign table',
  'materialized view',
  'table',
  'database',
  'schema',
  'view',
  'index',
  'type',
  'sequence',
  'trigger',
  'function',
  'procedure',
  'routine',
  'aggregate',
  'domain',
  'extension',
  'role',
  'user',
  'event',
  'policy',
  'rule',
  'collation',
  'tablespace'
]

const DROP = new RegExp(
  `^drop\\s+(${DROP_KINDS.map((k) => k.replace(' ', '\\s+')).join('|')})\\s+(?:concurrently\\s+)?${IF_EXISTS}${TARGET_LIST}`,
  'i'
)
/** Any other DROP is still a DROP; the summary quotes it rather than naming the kind. */
const DROP_OTHER = /^drop\s+(\S[\s\S]*)/i
const TRUNCATE = new RegExp(`^truncate\\s+(?:table\\s+)?(?:only\\s+)?${TARGET_LIST}`, 'i')
const DELETE = new RegExp(
  `^delete\\s+(?:(?:low_priority|quick|ignore)\\s+)*(?:from\\s+(?:only\\s+)?${TARGET_LIST}|${TARGET_LIST}\\s+from\\b)`,
  'i'
)
const UPDATE = new RegExp(`^update\\s+(?:(?:low_priority|ignore|only)\\s+)*${TARGET_LIST}`, 'i')
const ALTER = new RegExp(`^alter\\s+table\\s+${IF_EXISTS}(?:only\\s+)?(${TARGET})`, 'i')
const WITH = /^with\b/i
const TARGET_G = new RegExp(TARGET, 'g')

/** The names in a captured list, each as written, joined for prose. */
function targets(list: string): string {
  return (list.match(TARGET_G) ?? [list]).join(', ')
}

function detect(statement: string): DestructiveStatement[] {
  const drop = DROP.exec(statement)
  if (drop) {
    const kind = drop[1].toLowerCase().replace(/\s+/g, ' ')
    return [{ kind: 'drop', summary: `Drop ${kind} ${targets(drop[2])}` }]
  }

  const dropOther = DROP_OTHER.exec(statement)
  if (dropOther) {
    return [{ kind: 'drop', summary: `Drop ${dropOther[1].replace(/\s+/g, ' ').trim()}` }]
  }

  const truncate = TRUNCATE.exec(statement)
  if (truncate) return [{ kind: 'truncate', summary: `Empty ${targets(truncate[1])}` }]

  const del = DELETE.exec(statement)
  if (del) {
    if (hasTopLevelWord(statement.slice(del[0].length), 'where')) return []
    const list = del[1] ?? del[2]
    return [{ kind: 'delete-without-where', summary: `Delete every row in ${targets(list)}` }]
  }

  const update = UPDATE.exec(statement)
  if (update) {
    if (hasTopLevelWord(statement.slice(update[0].length), 'where')) return []
    return [{ kind: 'update-without-where', summary: `Update every row in ${targets(update[1])}` }]
  }

  const alter = ALTER.exec(statement)
  if (alter && hasTopLevelWord(statement.slice(alter[0].length), 'drop')) {
    return [{ kind: 'schema-change', summary: `Drop part of ${alter[1]}` }]
  }

  return []
}

const MAIN_KEYWORDS = new Set(['select', 'insert', 'update', 'delete', 'merge'])

interface CteSplit {
  /** Each top-level parenthesised body, since a CTE may itself delete or update. */
  bodies: string[]
  /** The statement the CTEs feed, from its first keyword to the end. */
  main: string
}

function splitCte(statement: string): CteSplit {
  const bodies: string[] = []
  for (const token of topLevelTokens(statement)) {
    if (token.kind === 'group') {
      bodies.push(token.value)
      continue
    }
    if (MAIN_KEYWORDS.has(token.value)) {
      return { bodies, main: statement.slice(token.index) }
    }
  }
  return { bodies, main: '' }
}

function analyse(statement: string): DestructiveStatement[] {
  if (!WITH.test(statement)) return detect(statement)
  const { bodies, main } = splitCte(statement)
  return [...bodies.flatMap(analyse), ...(main ? analyse(main) : [])]
}

/** The destructive statements in `sql`, in the order they would run. */
export function findDestructiveStatements(sql: string): DestructiveStatement[] {
  return statements(sql).flatMap(analyse)
}

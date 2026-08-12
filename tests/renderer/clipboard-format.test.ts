import { describe, expect, it } from 'vitest'
import {
  toInsertSql,
  toJsonText,
  toTsv
} from '../../src/renderer/src/features/tables/lib/clipboard-format'

const ROWS = [
  { id: 1, name: 'Ada', active: true },
  { id: 2, name: 'Grace', active: false }
]
const COLUMNS = ['id', 'name', 'active']

describe('as text for a spreadsheet', () => {
  it('is tab separated, one row per line', () => {
    expect(toTsv(ROWS, COLUMNS)).toBe('1\tAda\ttrue\n2\tGrace\tfalse')
  })

  it('adds the header only when asked', () => {
    expect(toTsv(ROWS, COLUMNS, { withHeader: true }).split('\n')[0]).toBe('id\tname\tactive')
  })

  it('quotes a value carrying a tab or a newline', () => {
    // Without this, one multi-line JSON column silently becomes several rows.
    const rows = [{ note: 'line one\nline two' }, { note: 'a\tb' }]

    expect(toTsv(rows, ['note'])).toBe('"line one\nline two"\n"a\tb"')
  })

  it('doubles a quote inside a quoted field', () => {
    expect(toTsv([{ note: 'say "hi"\nnow' }], ['note'])).toBe('"say ""hi""\nnow"')
  })

  it('writes NULL as an empty field - a spreadsheet has no NULL', () => {
    expect(toTsv([{ id: null }], ['id'])).toBe('')
  })

  it('serialises an object cell rather than printing [object Object]', () => {
    // It arrives quote-escaped, since JSON is full of quotes - that is what a
    // spreadsheet needs to read it back as one field.
    expect(toTsv([{ meta: { a: 1 } }], ['meta'])).toBe('"{""a"":1}"')
  })
})

describe('as JSON', () => {
  it('keeps the values typed rather than stringifying them', () => {
    // The whole point of this format over TSV.
    expect(JSON.parse(toJsonText(ROWS, COLUMNS))).toEqual(ROWS)
  })

  it('narrows to the copied columns', () => {
    expect(JSON.parse(toJsonText(ROWS, ['name']))).toEqual([{ name: 'Ada' }, { name: 'Grace' }])
  })

  it('gives a single cell as its bare value', () => {
    // Someone highlighting one number does not want {"id": 1} back.
    expect(toJsonText([{ id: 1 }], ['id'])).toBe('1')
    expect(toJsonText([{ name: 'Ada' }], ['name'])).toBe('"Ada"')
  })

  it('renders a single NULL cell as null', () => {
    expect(toJsonText([{ id: null }], ['id'])).toBe('null')
  })
})

describe('as INSERT statements', () => {
  const PG = { schema: 'public', table: 'users', engine: 'postgres' as const }

  it('qualifies and quotes for Postgres', () => {
    expect(toInsertSql([ROWS[0]], COLUMNS, PG)).toBe(
      'INSERT INTO "public"."users" ("id", "name", "active") VALUES (1, \'Ada\', TRUE);'
    )
  })

  it('uses backticks for MySQL', () => {
    const sql = toInsertSql([ROWS[0]], ['id'], { ...PG, engine: 'mysql' })
    expect(sql).toBe('INSERT INTO `public`.`users` (`id`) VALUES (1);')
  })

  it('leaves D1 unqualified - it has one schema', () => {
    const sql = toInsertSql([ROWS[0]], ['id'], { schema: 'main', table: 'users', engine: 'd1' })
    expect(sql).toBe('INSERT INTO "users" ("id") VALUES (1);')
  })

  it('doubles a quote inside a string', () => {
    expect(toInsertSql([{ name: "O'Hara" }], ['name'], PG)).toContain("'O''Hara'")
  })

  it('escapes a backslash for MySQL but not for Postgres', () => {
    // MySQL treats a backslash as an escape character inside a string by
    // default, so a Windows path pasted with Postgres rules arrives mangled.
    const row = [{ path: 'C:\\tmp' }]

    expect(toInsertSql(row, ['path'], { ...PG, engine: 'mysql' })).toContain("'C:\\\\tmp'")
    expect(toInsertSql(row, ['path'], PG)).toContain("'C:\\tmp'")
  })

  it('writes NULL unquoted', () => {
    expect(toInsertSql([{ id: null }], ['id'], PG)).toContain('VALUES (NULL)')
  })

  it('quotes a date as ISO and an object as JSON', () => {
    const row = [{ at: new Date('2026-08-10T00:00:00Z'), meta: { a: 1 } }]
    const sql = toInsertSql(row, ['at', 'meta'], PG)

    expect(sql).toContain("'2026-08-10T00:00:00.000Z'")
    expect(sql).toContain('\'{"a":1}\'')
  })

  it('refuses a non-finite number rather than emitting invalid SQL', () => {
    expect(toInsertSql([{ n: Infinity }], ['n'], PG)).toContain('VALUES (NULL)')
  })

  it('escapes an identifier that contains its own quote character', () => {
    const sql = toInsertSql([{ 'we"ird': 1 }], ['we"ird'], PG)
    expect(sql).toContain('"we""ird"')
  })

  it('writes one statement per row', () => {
    expect(toInsertSql(ROWS, COLUMNS, PG).split('\n')).toHaveLength(2)
  })

  it('is empty with nothing to copy', () => {
    expect(toInsertSql([], COLUMNS, PG)).toBe('')
    expect(toInsertSql(ROWS, [], PG)).toBe('')
  })
})

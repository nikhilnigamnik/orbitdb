import { describe, expect, it, vi } from 'vitest'
import {
  buildTableSearchSql,
  isSearchableColumn,
  orderTablesForSearch,
  sweepTables,
  toHits,
  type ValueSearchDialect
} from '../../../src/main/db/value-search'
import {
  VALUE_SEARCH_TABLE_LIMIT,
  type ColumnInfo,
  type TableInfo
} from '../../../src/shared/types'

const pg: ValueSearchDialect = {
  quoteIdent: (name) => `"${name.replace(/"/g, '""')}"`,
  placeholder: (position) => `$${position}`,
  supportsIlike: true,
  qualifiedTable: (schema, table) => `"${schema}"."${table}"`,
  castText: (expr) => `${expr}::text`
}

const mysql: ValueSearchDialect = {
  quoteIdent: (name) => `\`${name}\``,
  placeholder: () => '?',
  supportsIlike: false,
  qualifiedTable: (schema, table) => `\`${schema}\`.\`${table}\``,
  castText: (expr) => `cast(${expr} as char)`
}

function column(overrides: Partial<ColumnInfo> & Pick<ColumnInfo, 'name'>): ColumnInfo {
  return {
    dataType: 'text',
    udtName: 'text',
    isNullable: true,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null,
    ...overrides
  }
}

function table(name: string, estimatedRows: number | null = 0): TableInfo {
  return { schema: 'public', name, type: 'table', estimatedRows }
}

describe('which columns are worth searching', () => {
  it('takes text and uuid, which is what people paste', () => {
    expect(isSearchableColumn(column({ name: 'email' }), 'contains', 'a')).toBe(true)
    expect(
      isSearchableColumn(column({ name: 'id', dataType: 'uuid', udtName: 'uuid' }), 'contains', 'a')
    ).toBe(true)
  })

  it('takes an enum, which Postgres reports only as USER-DEFINED', () => {
    // The type name says nothing here, so the labels are what identify it.
    const status = column({
      name: 'status',
      dataType: 'USER-DEFINED',
      udtName: 'order_status',
      enumValues: ['pending', 'ready']
    })
    expect(isSearchableColumn(status, 'contains', 'pend')).toBe(true)
  })

  it('leaves numerics out of a contains search', () => {
    // Casting a bigint so `42` can match `1420` buries the real hit in noise.
    const total = column({ name: 'total', dataType: 'bigint', udtName: 'int8' })
    expect(isSearchableColumn(total, 'contains', '42')).toBe(false)
  })

  it('includes numerics on an exact search for a number', () => {
    const total = column({ name: 'total', dataType: 'bigint', udtName: 'int8' })
    expect(isSearchableColumn(total, 'exact', '42')).toBe(true)
  })

  it('still leaves numerics out when the term is not a number', () => {
    const total = column({ name: 'total', dataType: 'bigint', udtName: 'int8' })
    expect(isSearchableColumn(total, 'exact', 'abc')).toBe(false)
  })

  it('ignores a timestamp, which nobody searches by pasting one', () => {
    const at = column({ name: 'created_at', dataType: 'timestamptz', udtName: 'timestamptz' })
    expect(isSearchableColumn(at, 'contains', '2026')).toBe(false)
  })
})

describe('the per-table query', () => {
  const columns = [
    column({ name: 'id', dataType: 'uuid', udtName: 'uuid' }),
    column({ name: 'email' }),
    column({ name: 'created_at', dataType: 'timestamptz', udtName: 'timestamptz' })
  ]

  it('counts every candidate column in one scan of the table', () => {
    // One query per table, not one per column: the table is read once.
    const built = buildTableSearchSql(pg, 'public', 'users', columns, 'exact', 'x')

    expect(built?.columns).toEqual(['id', 'email'])
    expect(built?.sql).toBe(
      'select sum(case when "id"::text = $1 then 1 else 0 end) as c0, ' +
        'sum(case when "email"::text = $2 then 1 else 0 end) as c1 ' +
        'from "public"."users"'
    )
  })

  it('binds the term once per placeholder, not once per query', () => {
    // `?` is positional in SQLite and MySQL: every one is its own binding. One
    // value with a repeated placeholder only ever worked on Postgres, and D1
    // rejected every table with "Wrong number of parameter bindings".
    const built = buildTableSearchSql(pg, 'public', 'users', columns, 'exact', 'abc')
    expect(built?.params).toEqual(['abc', 'abc'])
  })

  it('gives a positional dialect one placeholder per binding', () => {
    const built = buildTableSearchSql(mysql, 'app', 'users', columns, 'exact', 'abc')

    expect(built?.sql.match(/\?/g)).toHaveLength(built?.params.length ?? 0)
  })

  it('lowers both sides on a contains search rather than trusting a collation', () => {
    // The three engines disagree about case, and being case-sensitive on one of
    // them is a silent wrong answer rather than a visible failure.
    const built = buildTableSearchSql(pg, 'public', 'users', columns, 'contains', 'ABC')

    expect(built?.sql).toContain('lower("id"::text) like $1')
    expect(built?.params).toEqual(['%abc%', '%abc%'])
  })

  it('uses each engine’s own cast, since MySQL has no text target', () => {
    const built = buildTableSearchSql(
      mysql,
      'app',
      'users',
      [column({ name: 'email' })],
      'exact',
      'x'
    )

    expect(built?.sql).toBe(
      'select sum(case when cast(`email` as char) = ? then 1 else 0 end) as c0 from `app`.`users`'
    )
  })

  it('skips the round trip entirely when no column could hold the term', () => {
    const onlyDates = [column({ name: 'created_at', dataType: 'date', udtName: 'date' })]
    expect(buildTableSearchSql(pg, 'public', 'events', onlyDates, 'contains', 'x')).toBeNull()
  })

  it('quotes a column name that would otherwise break out of the query', () => {
    const nasty = [column({ name: 'we"ird' })]
    const built = buildTableSearchSql(pg, 'public', 't', nasty, 'exact', 'x')

    expect(built?.sql).toContain('"we""ird"::text')
  })
})

describe('choosing which tables to sweep', () => {
  it('goes smallest first, so an answer arrives before the big tables do', () => {
    const ordered = orderTablesForSearch([table('big', 900), table('small', 3), table('mid', 50)])
    expect(ordered.searched.map((t) => t.name)).toEqual(['small', 'mid', 'big'])
  })

  it('treats an unknown row count as large rather than small', () => {
    // Guessing small is the expensive mistake - it puts an unbounded table first.
    const ordered = orderTablesForSearch([table('unknown', null), table('known', 10)])
    expect(ordered.searched.map((t) => t.name)).toEqual(['known', 'unknown'])
  })

  it('leaves views alone, since a view is its underlying tables again', () => {
    const view: TableInfo = { schema: 'public', name: 'v', type: 'view', estimatedRows: 0 }
    expect(orderTablesForSearch([view, table('t')]).searched.map((t) => t.name)).toEqual(['t'])
  })

  it('caps the sweep and says how many it dropped', () => {
    const many = Array.from({ length: VALUE_SEARCH_TABLE_LIMIT + 7 }, (_, i) => table(`t${i}`, i))
    const ordered = orderTablesForSearch(many)

    expect(ordered.searched).toHaveLength(VALUE_SEARCH_TABLE_LIMIT)
    expect(ordered.skipped).toBe(7)
  })
})

describe('reading the counts back', () => {
  it('keeps only the columns that matched', () => {
    const hits = toHits('public', 'users', ['id', 'email'], { c0: 0, c1: 3 })
    expect(hits).toEqual([{ schema: 'public', table: 'users', column: 'email', count: 3 }])
  })

  it('reads a count that arrived as a string, as pg sends it', () => {
    const hits = toHits('public', 'users', ['email'], { c0: '12' })
    expect(hits[0].count).toBe(12)
  })

  it('treats sum-over-no-rows as zero hits rather than a failure', () => {
    expect(toHits('public', 'empty', ['email'], { c0: null })).toEqual([])
  })
})

describe('the sweep', () => {
  function deps(overrides: Partial<Parameters<typeof sweepTables>[3]> = {}) {
    return {
      dialect: pg,
      listTables: vi.fn(async () => [table('a', 1), table('b', 2)]),
      columnsFor: vi.fn(async () => [column({ name: 'email' })]),
      run: vi.fn(async () => ({ c0: 1 })),
      isCancelled: () => false,
      ...overrides
    }
  }

  it('reports hits from every table, most first', async () => {
    const d = deps({
      run: vi.fn(async (sql: string) => ({ c0: sql.includes('"b"') ? 9 : 1 }))
    })
    const result = await sweepTables('public', 'x', 'exact', d)

    expect(result.hits.map((h) => [h.table, h.count])).toEqual([
      ['b', 9],
      ['a', 1]
    ])
    expect(result.tablesSearched).toBe(2)
  })

  it('carries on past a table it cannot read, and names it', async () => {
    // One unreadable table must not end the sweep - the rest may hold the answer.
    const d = deps({
      run: vi.fn(async (sql: string) => {
        if (sql.includes('"a"')) throw new Error('permission denied')
        return { c0: 4 }
      })
    })
    const result = await sweepTables('public', 'x', 'exact', d)

    expect(result.hits).toHaveLength(1)
    expect(result.failures).toEqual([{ table: 'a', error: 'permission denied' }])
  })

  it('stops when cancelled and says the results are partial', async () => {
    let calls = 0
    const d = deps({ isCancelled: () => calls++ > 0 })
    const result = await sweepTables('public', 'x', 'exact', d)

    expect(result.wasCancelled).toBe(true)
    expect(result.tablesSearched).toBe(1)
  })

  it('does not query a table with no searchable column', async () => {
    const d = deps({
      columnsFor: vi.fn(async () => [column({ name: 'at', dataType: 'date', udtName: 'date' })])
    })
    const result = await sweepTables('public', 'x', 'contains', d)

    expect(d.run).not.toHaveBeenCalled()
    expect(result.tablesSearched).toBe(0)
  })

  it('searches one table at a time rather than flooding the server', async () => {
    let inFlight = 0
    let peak = 0
    const d = deps({
      run: vi.fn(async () => {
        peak = Math.max(peak, ++inFlight)
        await Promise.resolve()
        inFlight--
        return { c0: 0 }
      })
    })
    await sweepTables('public', 'x', 'exact', d)

    expect(peak, 'a sweep is already the most expensive thing here').toBe(1)
  })
})

describe('what the footer is allowed to claim', () => {
  it('does not count a table it failed to read as searched', async () => {
    // "245 columns across 34 tables" sitting next to "34 could not be read" is
    // a contradiction: nothing was searched at all.
    const result = await sweepTables('public', 'x', 'exact', {
      dialect: pg,
      listTables: async () => [table('a', 1), table('b', 2)],
      columnsFor: async () => [column({ name: 'email' })],
      run: async () => {
        throw new Error('nope')
      },
      isCancelled: () => false
    })

    expect(result.tablesSearched).toBe(0)
    expect(result.columnsSearched).toBe(0)
    expect(result.failures).toHaveLength(2)
  })

  it('counts only the tables that answered', async () => {
    const result = await sweepTables('public', 'x', 'exact', {
      dialect: pg,
      listTables: async () => [table('a', 1), table('b', 2)],
      columnsFor: async () => [column({ name: 'email' }), column({ name: 'name' })],
      run: async (sql: string) => {
        if (sql.includes('"a"')) throw new Error('nope')
        return { c0: 0, c1: 0 }
      },
      isCancelled: () => false
    })

    expect(result.tablesSearched).toBe(1)
    expect(result.columnsSearched).toBe(2)
  })
})

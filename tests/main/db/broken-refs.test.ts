import { describe, expect, it, vi } from 'vitest'
import {
  buildOrphanSql,
  foreignKeyBase,
  inferCandidates,
  orderCandidates,
  referencedNameGuesses,
  sweepReferences,
  toBrokenCount
} from '../../../src/main/db/broken-refs'
import type { ValueSearchDialect } from '../../../src/main/db/value-search'
import {
  REFERENCE_CHECK_PAIR_LIMIT,
  type ColumnInfo,
  type ForeignKeyInfo,
  type TableDetails
} from '../../../src/shared/types'

const pg: ValueSearchDialect = {
  quoteIdent: (name) => `"${name.replace(/"/g, '""')}"`,
  placeholder: (position) => `$${position}`,
  supportsIlike: true,
  qualifiedTable: (schema, table) => `"${schema}"."${table}"`,
  castText: (expr) => `${expr}::text`
}

function column(name: string, udtName = 'uuid'): ColumnInfo {
  return {
    name,
    dataType: udtName,
    udtName,
    isNullable: true,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  }
}

function table(
  name: string,
  columns: ColumnInfo[],
  options: { primaryKey?: string[]; foreignKeys?: ForeignKeyInfo[] } = {}
): TableDetails {
  return {
    schema: 'public',
    name,
    type: 'table',
    columns,
    primaryKey: options.primaryKey ?? ['id'],
    indexes: [],
    foreignKeys: options.foreignKeys ?? [],
    estimatedRows: 0
  }
}

const USERS = table('users', [column('id'), column('email', 'text')])

describe('spotting a column that looks like a reference', () => {
  it('reads author_id and authorId the same way', () => {
    expect(foreignKeyBase('author_id')).toBe('author')
    expect(foreignKeyBase('authorId')).toBe('author')
  })

  it('leaves a column that is not one alone', () => {
    expect(foreignKeyBase('id')).toBeNull()
    expect(foreignKeyBase('identifier')).toBeNull()
    expect(foreignKeyBase('email')).toBeNull()
  })

  it('guesses the plural, since tables are usually named that way', () => {
    expect(referencedNameGuesses('user')).toContain('users')
    expect(referencedNameGuesses('category')).toContain('categories')
  })
})

describe('inferring what a column points at', () => {
  it('finds an undeclared reference by name', () => {
    const posts = table('posts', [column('id'), column('user_id')])
    const found = inferCandidates([USERS, posts])

    expect(found).toEqual([
      {
        table: 'posts',
        column: 'user_id',
        referencedTable: 'users',
        referencedColumn: 'id',
        isDeclared: false
      }
    ])
  })

  it('refuses to pair columns whose types disagree', () => {
    // `user_id integer` against `users.id uuid` is rejected outright by Postgres
    // and answered by SQLite with "every row is an orphan" - both useless.
    const posts = table('posts', [column('id'), column('user_id', 'int4')])
    expect(inferCandidates([USERS, posts])).toEqual([])
  })

  it('says nothing when no table matches the name', () => {
    const posts = table('posts', [column('id'), column('widget_id')])
    expect(inferCandidates([USERS, posts])).toEqual([])
  })

  it('keeps a declared foreign key even though the database should enforce it', () => {
    // SQLite ships with foreign_keys off, so D1 can hold orphans behind a
    // constraint that looks perfectly valid.
    const fk: ForeignKeyInfo = {
      name: 'posts_user_id_fkey',
      columns: ['user_id'],
      referencedSchema: 'public',
      referencedTable: 'users',
      referencedColumns: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION'
    }
    const posts = table('posts', [column('id'), column('user_id')], { foreignKeys: [fk] })
    const found = inferCandidates([USERS, posts])

    expect(found).toHaveLength(1)
    expect(found[0].isDeclared).toBe(true)
  })

  it('does not report the same column twice', () => {
    // A declared key already covers it; inferring it again would double the
    // work and read as two separate problems.
    const fk: ForeignKeyInfo = {
      name: 'posts_user_id_fkey',
      columns: ['user_id'],
      referencedSchema: 'public',
      referencedTable: 'users',
      referencedColumns: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION'
    }
    const posts = table('posts', [column('id'), column('user_id')], { foreignKeys: [fk] })
    expect(inferCandidates([USERS, posts])).toHaveLength(1)
  })

  it('skips a composite key, which needs every part joined at once', () => {
    const fk: ForeignKeyInfo = {
      name: 'x',
      columns: ['a', 'b'],
      referencedSchema: 'public',
      referencedTable: 'users',
      referencedColumns: ['id', 'email'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION'
    }
    const t = table('t', [column('a'), column('b')], { foreignKeys: [fk] })
    expect(inferCandidates([USERS, t])).toEqual([])
  })

  it('skips a parent with no single primary key to join against', () => {
    const parent = table('users', [column('id')], { primaryKey: [] })
    const posts = table('posts', [column('id'), column('user_id')])
    expect(inferCandidates([parent, posts])).toEqual([])
  })

  it('reads parent_id as pointing at its own table', () => {
    // The commonest self-reference in SQL, and one no table name will match.
    const categories = table('categories', [column('id'), column('parent_id')])
    const found = inferCandidates([categories])

    expect(found[0]).toMatchObject({ table: 'categories', referencedTable: 'categories' })
  })

  it('still prefers a real table over the self-reference guess', () => {
    const parents = table('parents', [column('id')])
    const kids = table('kids', [column('id'), column('parent_id')])

    expect(inferCandidates([parents, kids])[0].referencedTable).toBe('parents')
  })
})

describe('which pairs get checked', () => {
  const declared = { table: 'a', column: 'x', referencedTable: 'u', referencedColumn: 'id' }

  it('puts declared references first, since a broken one means it is not enforced', () => {
    const ordered = orderCandidates([
      { ...declared, table: 'z', isDeclared: false },
      { ...declared, table: 'a', isDeclared: true }
    ])
    expect(ordered.checked.map((c) => c.isDeclared)).toEqual([true, false])
  })

  it('caps the sweep and says how many it dropped', () => {
    const many = Array.from({ length: REFERENCE_CHECK_PAIR_LIMIT + 4 }, (_, i) => ({
      ...declared,
      table: `t${i}`,
      isDeclared: false
    }))
    const ordered = orderCandidates(many)

    expect(ordered.checked).toHaveLength(REFERENCE_CHECK_PAIR_LIMIT)
    expect(ordered.skipped).toBe(4)
  })
})

describe('the orphan query', () => {
  const candidate = {
    table: 'posts',
    column: 'user_id',
    referencedTable: 'users',
    referencedColumn: 'id',
    isDeclared: false
  }

  it('asks the question the way it is meant', () => {
    expect(buildOrphanSql(pg, 'public', candidate)).toBe(
      'select count(*) as broken from "public"."posts" c ' +
        'left join "public"."users" p on p."id" = c."user_id" ' +
        'where c."user_id" is not null and p."id" is null'
    )
  })

  it('does not count a NULL as broken', () => {
    // An absent reference is not a broken one - the same rule referencing.ts
    // applies when it declines to link on a NULL.
    expect(buildOrphanSql(pg, 'public', candidate)).toContain('is not null')
  })

  it('quotes an identifier that would otherwise break out of the query', () => {
    const nasty = { ...candidate, column: 'we"ird' }
    expect(buildOrphanSql(pg, 'public', nasty)).toContain('"we""ird"')
  })
})

describe('reading the count back', () => {
  it('reads a count that arrived as a string, as pg sends it', () => {
    expect(toBrokenCount({ broken: '7' })).toBe(7)
  })

  it('treats a missing row as zero rather than a failure', () => {
    expect(toBrokenCount(undefined)).toBe(0)
    expect(toBrokenCount({ broken: null })).toBe(0)
  })
})

describe('the sweep', () => {
  const posts = table('posts', [column('id'), column('user_id')])

  it('reports only the pairs that actually have orphans', async () => {
    const result = await sweepReferences('public', {
      dialect: pg,
      loadTables: async () => [USERS, posts],
      run: async () => ({ broken: 3 }),
      isCancelled: () => false
    })

    expect(result.broken).toEqual([
      {
        schema: 'public',
        table: 'posts',
        column: 'user_id',
        referencedTable: 'users',
        referencedColumn: 'id',
        isDeclared: false,
        count: 3
      }
    ])
    expect(result.pairsChecked).toBe(1)
  })

  it('says nothing is broken when nothing is', async () => {
    const result = await sweepReferences('public', {
      dialect: pg,
      loadTables: async () => [USERS, posts],
      run: async () => ({ broken: 0 }),
      isCancelled: () => false
    })

    expect(result.broken).toEqual([])
    expect(result.pairsFound).toBe(1)
  })

  it('carries on past a pair it cannot read, and names it', async () => {
    const result = await sweepReferences('public', {
      dialect: pg,
      loadTables: async () => [USERS, posts],
      run: async () => {
        throw new Error('permission denied')
      },
      isCancelled: () => false
    })

    expect(result.pairsChecked).toBe(0)
    expect(result.failures).toEqual([{ table: 'posts.user_id', error: 'permission denied' }])
  })

  it('stops when cancelled and says the results are partial', async () => {
    const result = await sweepReferences('public', {
      dialect: pg,
      loadTables: async () => [USERS, posts],
      run: async () => ({ broken: 1 }),
      isCancelled: () => true
    })

    expect(result.wasCancelled).toBe(true)
    expect(result.pairsChecked).toBe(0)
  })

  it('checks one pair at a time - each is a join across two whole tables', async () => {
    let inFlight = 0
    let peak = 0
    const wide = table('wide', [column('id'), column('user_id'), column('author_id')])
    const authors = table('authors', [column('id')])
    const run = vi.fn(async () => {
      peak = Math.max(peak, ++inFlight)
      await Promise.resolve()
      inFlight--
      return { broken: 0 }
    })

    await sweepReferences('public', {
      dialect: pg,
      loadTables: async () => [USERS, authors, wide],
      run,
      isCancelled: () => false
    })

    expect(run).toHaveBeenCalledTimes(2)
    expect(peak).toBe(1)
  })
})

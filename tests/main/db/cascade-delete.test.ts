import { describe, expect, it } from 'vitest'
import {
  CascadeCycleError,
  CascadeLimitError,
  buildMatchSql,
  lockStatements,
  normaliseTuples,
  planCascadeDelete,
  rootTuples,
  toCascadeResult,
  toPkTuples,
  tuplesPerStatement,
  type CascadeDeleteDeps
} from '../../../src/main/db/cascade-delete'
import {
  CASCADE_DELETE_BIND_CHUNK,
  CASCADE_DELETE_KEY_LIMIT,
  CASCADE_DELETE_MAX_DEPTH,
  D1_MAX_BOUND_PARAMS,
  type ReferencingKeyInfo
} from '../../../src/shared/types'
import type { ValueSearchDialect } from '../../../src/main/db/value-search'

// The walk is where every decision that can be wrong lives - what is followed,
// what is left alone, and the order the deletes come out in - and none of it
// needs a server. The fake below runs the statements the planner builds against
// in-memory tables, so the assertions are about real results rather than about
// the shape of a string.

const dialect: ValueSearchDialect = {
  quoteIdent: (name) => `«${name}»`,
  placeholder: (position) => `$${position}`,
  supportsIlike: true,
  qualifiedTable: (schema, table) => `«${schema}».«${table}»`,
  castText: (expr) => `${expr}::text`
}

interface FakeSchema {
  /** Rows per `schema.table`. */
  tables: Record<string, Record<string, unknown>[]>
  /** Foreign keys pointing *at* each `schema.table`. */
  keys: Record<string, ReferencingKeyInfo[]>
}

function key(overrides: Partial<ReferencingKeyInfo> & Pick<ReferencingKeyInfo, 'table'>) {
  return {
    name: `${overrides.table}_fk`,
    schema: 'app',
    referencedSchema: 'app',
    referencedTable: 'user',
    columns: ['user_id'],
    referencedColumns: ['id'],
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
    ...overrides
  } satisfies ReferencingKeyInfo
}

/**
 * Reads back what `buildMatchSql` wrote, as a predicate over a row.
 *
 * It emits two forms - a single-column IN list and an OR of composite
 * equalities - and a where clause can now hold several of them OR'd together,
 * which is how a table reached by two foreign keys is counted. Placeholders are
 * resolved by their position rather than by chunking the parameter list, so
 * clauses naming different numbers of columns still parse.
 */
function predicateFor(sql: string, params: unknown[]): (row: Record<string, unknown>) => boolean {
  const where = sql.slice(sql.indexOf(' where ') + 7)
  const clauses: ((row: Record<string, unknown>) => boolean)[] = []

  for (const match of where.matchAll(/«([^»]+)» in \(([^)]*)\)/g)) {
    const column = match[1]
    const values = match[2].split(',').map((slot) => params[Number(slot.trim().slice(1)) - 1])
    clauses.push((row) => values.some((value) => row[column] === value))
  }

  for (const match of where.matchAll(/«[^»]+» = \$\d+(?: and «[^»]+» = \$\d+)+/g)) {
    const pairs = [...match[0].matchAll(/«([^»]+)» = \$(\d+)/g)].map(
      (pair) => [pair[1], params[Number(pair[2]) - 1]] as const
    )
    clauses.push((row) => pairs.every(([column, value]) => row[column] === value))
  }

  return (row) => clauses.some((clause) => clause(row))
}

interface FakeRun {
  deps: CascadeDeleteDeps
  /** Every delete the planner produced, in the order it was told to run them. */
  runStatements(statements: { sql: string; params: unknown[] }[]): string[]
  /** How many times each `schema.table` was asked for its referencing keys. */
  keyLookups: Map<string, number>
  schema: FakeSchema
}

/**
 * The database's own check, at statement end: nothing left may still point at
 * a row that just went. Without it a delete in the wrong order passes here and
 * is refused by a real server.
 */
function assertNothingDangling(
  schema: FakeSchema,
  name: string,
  removed: Record<string, unknown>[]
): void {
  for (const fk of schema.keys[name] ?? []) {
    // SET NULL, SET DEFAULT and CASCADE are the database's to handle.
    if (fk.onDelete !== 'NO ACTION' && fk.onDelete !== 'RESTRICT') continue
    const children = schema.tables[`${fk.schema}.${fk.table}`] ?? []
    const isDangling = children.some((child) =>
      removed.some((gone) =>
        fk.columns.every((column, i) => child[column] === gone[fk.referencedColumns[i]])
      )
    )
    if (isDangling) {
      throw new Error(
        `foreign key violation: ${fk.schema}.${fk.table} (${fk.columns.join(', ')}) still points at a deleted ${name} row`
      )
    }
  }
}

function fake(schema: FakeSchema): FakeRun {
  const keyLookups = new Map<string, number>()
  const deps: CascadeDeleteDeps = {
    dialect,
    referencingKeys: async (s, t) => {
      const name = `${s}.${t}`
      keyLookups.set(name, (keyLookups.get(name) ?? 0) + 1)
      return schema.keys[name] ?? []
    },
    select: async (sql, params) => {
      const table = sql.slice(sql.indexOf(' from ') + 6).match(/«([^»]+)»\.«([^»]+)»/)
      if (!table) throw new Error(`unparseable table in ${sql}`)
      const rows = schema.tables[`${table[1]}.${table[2]}`] ?? []
      const hits = rows.filter(predicateFor(sql, params))
      if (sql.startsWith('select count(*)')) return [{ total: hits.length }]
      const projection = sql.slice('select distinct '.length, sql.indexOf(' from '))
      const wanted = [...projection.matchAll(/«([^»]+)»/g)].map((m) => m[1])
      return hits.map((row) => Object.fromEntries(wanted.map((column) => [column, row[column]])))
    }
  }

  return {
    deps,
    schema,
    keyLookups,
    runStatements(statements) {
      const order: string[] = []
      for (const statement of statements) {
        const table = statement.sql.match(/delete from «([^»]+)»\.«([^»]+)»/)
        if (!table) throw new Error(`unparseable delete: ${statement.sql}`)
        const name = `${table[1]}.${table[2]}`
        if (order[order.length - 1] !== name) order.push(name)
        const matchesRow = predicateFor(statement.sql, statement.params)
        const rows = schema.tables[name] ?? []
        schema.tables[name] = rows.filter((row) => !matchesRow(row))
        assertNothingDangling(schema, name, rows.filter(matchesRow))
      }
      return order
    }
  }
}

/**
 * A straight chain exactly as deep as the walk will follow, with one more table
 * hanging off the end - the case where `isTruncated` has to tell "there is more
 * below" apart from "the schema says there could be, and there isn't".
 */
function chain(leafRows: Record<string, unknown>[]): FakeSchema {
  const tables: FakeSchema['tables'] = { 'app.t0': [{ id: 1 }] }
  const keys: FakeSchema['keys'] = {}
  for (let i = 1; i <= CASCADE_DELETE_MAX_DEPTH; i++) {
    tables[`app.t${i}`] = [{ id: 1, parent_id: 1 }]
    keys[`app.t${i - 1}`] = [
      key({
        name: `t${i}_fk`,
        table: `t${i}`,
        referencedTable: `t${i - 1}`,
        columns: ['parent_id'],
        referencedColumns: ['id']
      })
    ]
  }
  tables['app.leaf'] = leafRows
  keys[`app.t${CASCADE_DELETE_MAX_DEPTH}`] = [
    key({
      name: 'leaf_fk',
      table: 'leaf',
      referencedTable: `t${CASCADE_DELETE_MAX_DEPTH}`,
      columns: ['parent_id'],
      referencedColumns: ['id']
    })
  ]
  return { tables, keys }
}

describe('buildMatchSql', () => {
  it('binds a single column as an IN list', () => {
    const params: unknown[] = []
    const sql = buildMatchSql(dialect, ['id'], [[1], [2]], params)
    expect(sql).toBe('(«id» in ($1, $2))')
    expect(params).toEqual([1, 2])
  })

  it('binds a composite key as one group per tuple', () => {
    const params: unknown[] = []
    const sql = buildMatchSql(
      dialect,
      ['org', 'id'],
      [
        ['a', 1],
        ['b', 2]
      ],
      params
    )
    expect(sql).toBe('((«org» = $1 and «id» = $2) or («org» = $3 and «id» = $4))')
    expect(params).toEqual(['a', 1, 'b', 2])
  })

  it('numbers placeholders from where the statement already is', () => {
    const params: unknown[] = ['existing']
    buildMatchSql(dialect, ['id'], [[7]], params)
    expect(params).toEqual(['existing', 7])
  })
})

describe('normaliseTuples', () => {
  it('drops NULL keys, which can never match a row', () => {
    expect(normaliseTuples([[1], [null], [undefined], [2]])).toEqual([[1], [2]])
  })

  it('drops a composite tuple with a NULL in any position', () => {
    expect(
      normaliseTuples([
        ['a', null],
        ['a', 1]
      ])
    ).toEqual([['a', 1]])
  })

  it('deduplicates, so two children of one parent bind one value', () => {
    expect(normaliseTuples([[1], [1], [2]])).toEqual([[1], [2]])
  })
})

describe('toPkTuples', () => {
  it('refuses a partial key rather than matching on what is left', () => {
    expect(() => toPkTuples(['org', 'id'], [{ org: 'a' }])).toThrow(/Missing primary key column id/)
  })
})

describe('rootTuples', () => {
  it('drops NULL and duplicate keys before anything runs', () => {
    expect(rootTuples('app', 'user', ['id'], [{ id: 1 }, { id: null }, { id: 1 }])).toEqual([[1]])
  })

  it('refuses a key list with nothing usable, with the message the planner uses', () => {
    // The drivers lock the target rows before the planner runs. Fed the raw
    // tuples, an all-NULL list reached the server as `where ("id" in ())`.
    expect(() => rootTuples('app', 'user', ['id'], [{ id: null }])).toThrow(
      /no primary key values to start from/
    )
    expect(() => rootTuples('app', 'user', ['id'], [])).toThrow(
      /no primary key values to start from/
    )
  })
})

describe('tuplesPerStatement', () => {
  it('keeps the tuple chunk on an engine with no parameter cap', () => {
    expect(tuplesPerStatement({ dialect }, 1)).toBe(CASCADE_DELETE_BIND_CHUNK)
    expect(tuplesPerStatement({ dialect }, 4)).toBe(CASCADE_DELETE_BIND_CHUNK)
  })

  it('fits whole tuples under a parameter cap, and never fewer than one', () => {
    const d1 = { dialect, maxBindParams: D1_MAX_BOUND_PARAMS }
    expect(tuplesPerStatement(d1, 1)).toBe(100)
    expect(tuplesPerStatement(d1, 3)).toBe(33)
    expect(tuplesPerStatement(d1, 250)).toBe(1)
  })
})

describe('lockStatements', () => {
  it('splits the lock by the parameter cap of the engine', () => {
    const values = Array.from({ length: 250 }, (_, i) => [i])
    const locks = lockStatements({ dialect, maxBindParams: 100 }, 'app', 'user', ['id'], values)
    expect(locks.map((lock) => lock.params.length)).toEqual([100, 100, 50])
    expect(locks[0].sql).toMatch(
      /^select 1 from «app»\.«user» where \(«id» in \(.+\)\) for update$/
    )
  })

  it('emits nothing for an empty list rather than an empty IN', () => {
    expect(lockStatements({ dialect }, 'app', 'user', ['id'], [])).toEqual([])
  })
})

describe('planCascadeDelete', () => {
  it('counts each dependent table and deletes deepest first', async () => {
    const run = fake({
      tables: {
        'app.user': [{ id: 1 }, { id: 2 }],
        'app.post': [
          { id: 10, user_id: 1 },
          { id: 11, user_id: 1 },
          { id: 12, user_id: 2 }
        ],
        'app.comment': [
          { id: 100, post_id: 10 },
          { id: 101, post_id: 11 },
          { id: 102, post_id: 12 }
        ]
      },
      keys: {
        'app.user': [key({ table: 'post' })],
        'app.post': [
          key({
            table: 'comment',
            referencedTable: 'post',
            columns: ['post_id'],
            referencedColumns: ['id']
          })
        ]
      }
    })

    const { plan, statements } = await planCascadeDelete('app', 'user', ['id'], [[1]], run.deps)

    expect(plan.targetRows).toBe(1)
    expect(plan.steps.map((s) => [s.table, s.depth, s.rowCount])).toEqual([
      ['post', 1, 2],
      ['comment', 2, 2]
    ])
    expect(plan.totalRows).toBe(4)
    expect(plan.isTruncated).toBe(false)

    // Bottom-up, target last: any other order leaves a constraint violated.
    expect(run.runStatements(statements)).toEqual(['app.comment', 'app.post', 'app.user'])
    expect(run.schema.tables['app.user']).toEqual([{ id: 2 }])
    expect(run.schema.tables['app.post']).toEqual([{ id: 12, user_id: 2 }])
    expect(run.schema.tables['app.comment']).toEqual([{ id: 102, post_id: 12 }])
  })

  it('reports a SET NULL child as kept, and does not walk past it', async () => {
    const run = fake({
      tables: {
        'app.user': [{ id: 1 }],
        'app.audit': [{ id: 5, user_id: 1 }],
        'app.audit_detail': [{ id: 50, audit_id: 5 }]
      },
      keys: {
        'app.user': [key({ table: 'audit', onDelete: 'SET NULL' })],
        'app.audit': [
          key({
            table: 'audit_detail',
            referencedTable: 'audit',
            columns: ['audit_id'],
            referencedColumns: ['id']
          })
        ]
      }
    })

    const { plan, statements } = await planCascadeDelete('app', 'user', ['id'], [[1]], run.deps)

    expect(plan.steps).toEqual([])
    expect(plan.detached.map((d) => [d.table, d.rowCount, d.onDelete])).toEqual([
      ['audit', 1, 'SET NULL']
    ])
    // The row the schema says survives is still there, and so is its own child.
    expect(run.runStatements(statements)).toEqual(['app.user'])
    expect(run.schema.tables['app.audit']).toHaveLength(1)
    expect(run.schema.tables['app.audit_detail']).toHaveLength(1)
  })

  it('follows a self-reference down real levels', async () => {
    const run = fake({
      tables: {
        'app.category': [
          { id: 1, parent_id: null },
          { id: 2, parent_id: 1 },
          { id: 3, parent_id: 2 },
          { id: 4, parent_id: null }
        ]
      },
      keys: {
        'app.category': [
          key({
            table: 'category',
            referencedTable: 'category',
            columns: ['parent_id'],
            referencedColumns: ['id']
          })
        ]
      }
    })

    const { plan, statements } = await planCascadeDelete('app', 'category', ['id'], [[1]], run.deps)

    expect(plan.steps.map((s) => [s.depth, s.rowCount])).toEqual([
      [1, 1],
      [2, 1]
    ])
    run.runStatements(statements)
    expect(run.schema.tables['app.category']).toEqual([{ id: 4, parent_id: null }])
  })

  it('does not report a table with no matching child rows', async () => {
    const run = fake({
      tables: { 'app.user': [{ id: 1 }], 'app.post': [{ id: 10, user_id: 99 }] },
      keys: { 'app.user': [key({ table: 'post' })] }
    })
    const { plan } = await planCascadeDelete('app', 'user', ['id'], [[1]], run.deps)
    expect(plan.steps).toEqual([])
    expect(plan.totalRows).toBe(0)
  })

  it('names a table whose dependents could not be read instead of swallowing it', async () => {
    const run = fake({
      tables: { 'app.user': [{ id: 1 }] },
      keys: { 'app.user': [key({ table: 'post' })] }
    })
    const deps: CascadeDeleteDeps = {
      ...run.deps,
      select: async (sql, params) => {
        if (sql.includes('«post»')) throw new Error('permission denied for table post')
        return run.deps.select(sql, params)
      }
    }
    const { plan } = await planCascadeDelete('app', 'user', ['id'], [[1]], deps)
    expect(plan.failures).toEqual([
      { table: 'app.post', error: 'permission denied for table post' }
    ])
    expect(plan.steps).toEqual([])
  })

  it('refuses rather than half-plans when a level carries far too many keys', async () => {
    const rows = Array.from({ length: CASCADE_DELETE_KEY_LIMIT + 1 }, (_, i) => ({ id: i }))
    const run = fake({ tables: { 'app.user': rows }, keys: {} })
    await expect(
      planCascadeDelete(
        'app',
        'user',
        ['id'],
        rows.map((row) => [row.id]),
        run.deps
      )
    ).rejects.toBeInstanceOf(CascadeLimitError)
  })

  it('chunks a level past the bind limit instead of refusing the whole plan', async () => {
    // The ordinary customer -> orders -> order_items shape. `post` carries one
    // key value, but the ids it hands `comment` are one per row, and that list
    // used to be refused outright - leaving no path at all, since the plain
    // delete had already been turned down by the foreign key.
    const posts = Array.from({ length: CASCADE_DELETE_BIND_CHUNK + 1 }, (_, i) => ({
      id: i,
      user_id: 1
    }))
    const run = fake({
      tables: {
        'app.user': [{ id: 1 }],
        'app.post': posts,
        'app.comment': [
          { id: 5000, post_id: 0 },
          { id: 5001, post_id: CASCADE_DELETE_BIND_CHUNK }
        ]
      },
      keys: {
        'app.user': [key({ table: 'post' })],
        'app.post': [
          key({
            name: 'comment_fk',
            table: 'comment',
            referencedTable: 'post',
            columns: ['post_id'],
            referencedColumns: ['id']
          })
        ]
      }
    })

    const { plan, statements } = await planCascadeDelete('app', 'user', ['id'], [[1]], run.deps)

    expect(plan.steps.map((s) => [s.table, s.rowCount])).toEqual([
      ['post', CASCADE_DELETE_BIND_CHUNK + 1],
      ['comment', 2]
    ])
    expect(plan.totalRows).toBe(CASCADE_DELETE_BIND_CHUNK + 3)
    // comment splits across two statements, post and user need one each.
    expect(statements.length).toBe(4)
    expect(run.runStatements(statements)).toEqual(['app.comment', 'app.post', 'app.user'])
    expect(run.schema.tables['app.comment']).toEqual([])
    expect(run.schema.tables['app.post']).toEqual([])
    expect(run.schema.tables['app.user']).toEqual([])
  })

  it('counts a table reached by two foreign keys once, not twice', async () => {
    const run = fake({
      tables: {
        'app.user': [{ id: 1 }, { id: 2 }],
        'app.notification': [
          { id: 1, recipient_id: 1, actor_id: 1 },
          { id: 2, recipient_id: 1, actor_id: 2 },
          { id: 3, recipient_id: 2, actor_id: 1 }
        ]
      },
      keys: {
        'app.user': [
          key({
            name: 'notification_recipient_fk',
            table: 'notification',
            columns: ['recipient_id']
          }),
          key({ name: 'notification_actor_fk', table: 'notification', columns: ['actor_id'] })
        ]
      }
    })

    const { plan, statements } = await planCascadeDelete('app', 'user', ['id'], [[1]], run.deps)

    // Each step reports its own constraint honestly; the rows they name overlap.
    expect(plan.steps.map((s) => [s.constraintName, s.rowCount])).toEqual([
      ['notification_recipient_fk', 2],
      ['notification_actor_fk', 2]
    ])
    // Three distinct rows go, not the 4 the two steps sum to.
    expect(plan.totalRows).toBe(3)
    run.runStatements(statements)
    expect(run.schema.tables['app.notification']).toEqual([])
  })

  it('does not call a plan truncated when the table at the depth limit has no children', async () => {
    const run = fake(chain([]))
    const { plan } = await planCascadeDelete('app', 't0', ['id'], [[1]], run.deps)
    expect(plan.steps).toHaveLength(CASCADE_DELETE_MAX_DEPTH)
    expect(plan.isTruncated).toBe(false)
  })

  it('calls a plan truncated when the table at the depth limit really has children', async () => {
    const run = fake(chain([{ id: 1, parent_id: 1 }]))
    const { plan } = await planCascadeDelete('app', 't0', ['id'], [[1]], run.deps)
    expect(plan.steps).toHaveLength(CASCADE_DELETE_MAX_DEPTH)
    expect(plan.steps.some((s) => s.table === 'leaf')).toBe(false)
    expect(plan.isTruncated).toBe(true)
  })

  it('asks each table for its referencing keys once per walk', async () => {
    const run = fake({
      tables: {
        'app.node': [
          { id: 1, parent_id: null },
          { id: 2, parent_id: 1 },
          { id: 3, parent_id: 2 }
        ]
      },
      keys: {
        'app.node': [
          key({
            name: 'node_parent_fk',
            table: 'node',
            referencedTable: 'node',
            columns: ['parent_id'],
            referencedColumns: ['id']
          })
        ]
      }
    })

    const { plan } = await planCascadeDelete('app', 'node', ['id'], [[1]], run.deps)

    // The tree is walked level by level, but the answer cannot change inside one
    // walk - on D1 each of these is a pragma sweep over the whole database.
    expect(plan.steps.map((s) => s.depth)).toEqual([1, 2])
    expect(run.keyLookups.get('app.node')).toBe(1)
  })

  it('starts from nothing rather than deleting on an empty key', async () => {
    const run = fake({ tables: { 'app.user': [{ id: 1 }] }, keys: {} })
    await expect(planCascadeDelete('app', 'user', ['id'], [[null]], run.deps)).rejects.toThrow(
      /no primary key values/
    )
  })

  it('binds no more parameters per statement than the engine allows', async () => {
    // A composite key spends two parameters per tuple, so D1's cap of 100 fits
    // fifty tuples - not the thousand the tuple chunk would have bound, which
    // D1 rejected outright and the per-key catch then recorded as a failure,
    // leaving the subtree out of the plan.
    const posts = Array.from({ length: 120 }, (_, i) => ({ a: i, b: i * 2, user_id: 1 }))
    const comments = posts.map((post, i) => ({ id: i, post_a: post.a, post_b: post.b }))
    const run = fake({
      tables: { 'app.user': [{ id: 1 }], 'app.post': posts, 'app.comment': comments },
      keys: {
        'app.user': [key({ table: 'post' })],
        'app.post': [
          key({
            name: 'comment_fk',
            table: 'comment',
            referencedTable: 'post',
            columns: ['post_a', 'post_b'],
            referencedColumns: ['a', 'b']
          })
        ]
      }
    })
    const bound: number[] = []
    const deps: CascadeDeleteDeps = {
      ...run.deps,
      maxBindParams: D1_MAX_BOUND_PARAMS,
      select: async (sql, params) => {
        bound.push(params.length)
        return run.deps.select(sql, params)
      }
    }

    const { plan, statements } = await planCascadeDelete('app', 'user', ['id'], [[1]], deps)
    for (const statement of statements) bound.push(statement.params.length)

    expect(Math.max(...bound)).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS)
    expect(plan.failures).toEqual([])
    expect(plan.steps.map((s) => [s.table, s.rowCount])).toEqual([
      ['post', 120],
      ['comment', 120]
    ])
    // 120 two-column tuples at fifty a statement: three for comment, then one each.
    expect(statements.map((s) => s.table)).toEqual([
      'comment',
      'comment',
      'comment',
      'post',
      'user'
    ])
    expect(run.runStatements(statements)).toEqual(['app.comment', 'app.post', 'app.user'])
    expect(run.schema.tables['app.comment']).toEqual([])
  })

  it('keeps the thousand-tuple chunk where nothing caps the parameters', async () => {
    const posts = Array.from({ length: 120 }, (_, i) => ({ a: i, b: i * 2, user_id: 1 }))
    const run = fake({
      tables: {
        'app.user': [{ id: 1 }],
        'app.post': posts,
        'app.comment': posts.map((post, i) => ({ id: i, post_a: post.a, post_b: post.b }))
      },
      keys: {
        'app.user': [key({ table: 'post' })],
        'app.post': [
          key({
            table: 'comment',
            referencedTable: 'post',
            columns: ['post_a', 'post_b'],
            referencedColumns: ['a', 'b']
          })
        ]
      }
    })

    const { statements } = await planCascadeDelete('app', 'user', ['id'], [[1]], run.deps)

    expect(statements.map((s) => [s.table, s.params.length])).toEqual([
      ['comment', 240],
      ['post', 1],
      ['user', 1]
    ])
  })

  it('refuses a loop rather than deleting a row before the one still pointing at it', async () => {
    // users.current_org_id -> orgs.id and orgs.owner_id -> users.id, with the
    // user owning the org they belong to. The org must go before the user and
    // the user before the org. The old walk planned the user again two levels
    // down, deleted it first, and ran into the foreign key - after a preview
    // that had re-counted the same rows at every level.
    const run = fake({
      tables: {
        'app.user': [{ id: 1, current_org_id: 10 }],
        'app.org': [{ id: 10, owner_id: 1 }]
      },
      keys: {
        'app.user': [key({ name: 'org_owner_fk', table: 'org', columns: ['owner_id'] })],
        'app.org': [
          key({
            name: 'user_org_fk',
            table: 'user',
            referencedTable: 'org',
            columns: ['current_org_id'],
            referencedColumns: ['id']
          })
        ]
      }
    })

    const attempt = planCascadeDelete('app', 'user', ['id'], [[1]], run.deps)

    await expect(attempt).rejects.toBeInstanceOf(CascadeCycleError)
    await expect(attempt).rejects.toThrow(
      /would loop: rows in app\.org reached through owner_id are already queued/
    )
    // Refused outright: nothing was planned, so there was nothing to run.
    expect(run.schema.tables['app.user']).toHaveLength(1)
    expect(run.schema.tables['app.org']).toHaveLength(1)
  })

  it('lets two keys into one table overlap at the same level', async () => {
    // posts.author_id and posts.editor_id both point at users, so the two post
    // nodes at depth 1 select overlapping post ids to feed comments. That is
    // two paths side by side, not a loop.
    const run = fake({
      tables: {
        'app.user': [{ id: 1 }],
        'app.post': [
          { id: 10, author_id: 1, editor_id: 1 },
          { id: 11, author_id: 1, editor_id: 2 }
        ],
        'app.comment': [
          { id: 100, post_id: 10 },
          { id: 101, post_id: 11 }
        ]
      },
      keys: {
        'app.user': [
          key({ name: 'post_author_fk', table: 'post', columns: ['author_id'] }),
          key({ name: 'post_editor_fk', table: 'post', columns: ['editor_id'] })
        ],
        'app.post': [
          key({
            table: 'comment',
            referencedTable: 'post',
            columns: ['post_id'],
            referencedColumns: ['id']
          })
        ]
      }
    })

    const { plan, statements } = await planCascadeDelete('app', 'user', ['id'], [[1]], run.deps)

    expect(plan.steps.map((s) => [s.table, s.depth, s.rowCount])).toEqual([
      ['post', 1, 2],
      ['post', 1, 1],
      ['comment', 2, 2],
      ['comment', 2, 1]
    ])
    expect(plan.totalRows).toBe(4)
    expect(run.runStatements(statements)).toEqual(['app.comment', 'app.post', 'app.user'])
    expect(run.schema.tables['app.post']).toEqual([])
    expect(run.schema.tables['app.comment']).toEqual([])
  })

  it('deletes rows reached along two paths after the dependents of both', async () => {
    // A user's comment on the user's own post, with a like on it. comments is
    // reached through user_id at depth 1 and through posts.id at depth 2 with
    // the same rows, so the likes under it are one node linked from both. In
    // reverse walk order the deeper comments node ran before the likes whenever
    // the catalogue listed comments.user_id ahead of posts.author_id, and the
    // database refused it. Not a loop: nothing here points back up.
    const run = fake({
      tables: {
        'app.user': [{ id: 1 }],
        'app.post': [{ id: 10, author_id: 1 }],
        'app.comment': [{ id: 100, user_id: 1, post_id: 10 }],
        'app.like': [{ id: 1000, comment_id: 100 }]
      },
      keys: {
        'app.user': [
          key({ name: 'comment_user_fk', table: 'comment' }),
          key({ name: 'post_author_fk', table: 'post', columns: ['author_id'] })
        ],
        'app.post': [
          key({
            name: 'comment_post_fk',
            table: 'comment',
            referencedTable: 'post',
            columns: ['post_id'],
            referencedColumns: ['id']
          })
        ],
        'app.comment': [
          key({
            name: 'like_fk',
            table: 'like',
            referencedTable: 'comment',
            columns: ['comment_id'],
            referencedColumns: ['id']
          })
        ]
      }
    })

    const { plan, statements } = await planCascadeDelete('app', 'user', ['id'], [[1]], run.deps)

    // The like sits below the deeper of its two parents.
    expect(plan.steps.map((s) => [s.table, s.depth])).toEqual([
      ['comment', 1],
      ['post', 1],
      ['comment', 2],
      ['like', 3]
    ])
    // One comment, one post, one like - the comment reached twice counts once.
    expect(plan.totalRows).toBe(3)
    expect(run.runStatements(statements)).toEqual([
      'app.like',
      'app.comment',
      'app.post',
      'app.comment',
      'app.user'
    ])
    expect(Object.values(run.schema.tables).every((rows) => rows.length === 0)).toBe(true)
  })

  it('skips every count on the execute replan, which only needs the statements', async () => {
    const run = fake({
      tables: {
        'app.user': [{ id: 1 }, { id: 2 }],
        'app.post': [
          { id: 10, user_id: 1 },
          { id: 11, user_id: 1 },
          { id: 12, user_id: 2 }
        ],
        'app.comment': [
          { id: 100, post_id: 10 },
          { id: 101, post_id: 11 },
          { id: 102, post_id: 12 }
        ],
        'app.audit': []
      },
      keys: {
        'app.user': [key({ table: 'post' }), key({ name: 'audit_fk', table: 'audit' })],
        'app.post': [
          key({
            table: 'comment',
            referencedTable: 'post',
            columns: ['post_id'],
            referencedColumns: ['id']
          })
        ]
      }
    })
    let counts = 0
    const deps: CascadeDeleteDeps = {
      ...run.deps,
      select: async (sql, params) => {
        if (sql.startsWith('select count(*)')) counts += 1
        return run.deps.select(sql, params)
      }
    }

    const preview = await planCascadeDelete('app', 'user', ['id'], [[1]], deps)
    expect(counts, 'the preview still counts').toBeGreaterThan(0)
    expect(preview.statements.map((s) => s.table)).toEqual(['comment', 'post', 'user'])

    counts = 0
    const { plan, statements } = await planCascadeDelete('app', 'user', ['id'], [[1]], deps, {
      shouldCount: false
    })

    expect(counts).toBe(0)
    expect(plan.totalRows).toBe(0)
    // The empty audit table the count had pruned is now a delete matching nothing.
    expect(statements.map((s) => s.table)).toEqual(['comment', 'audit', 'post', 'user'])
    expect(run.runStatements(statements)).toEqual([
      'app.comment',
      'app.audit',
      'app.post',
      'app.user'
    ])
    expect(run.schema.tables['app.user']).toEqual([{ id: 2 }])
    expect(run.schema.tables['app.post']).toEqual([{ id: 12, user_id: 2 }])
    expect(run.schema.tables['app.comment']).toEqual([{ id: 102, post_id: 12 }])
  })
})

describe('toCascadeResult', () => {
  it('folds a table reached twice into one line', () => {
    const result = toCascadeResult(
      [
        { schema: 'app', table: 'note', rows: 2 },
        { schema: 'app', table: 'note', rows: 3 },
        { schema: 'app', table: 'user', rows: 1 }
      ],
      true
    )
    expect(result.deleted).toEqual([
      { schema: 'app', table: 'note', rows: 5 },
      { schema: 'app', table: 'user', rows: 1 }
    ])
    expect(result.totalRows).toBe(6)
    expect(result.wasAtomic).toBe(true)
  })
})

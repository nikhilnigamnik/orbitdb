import { describe, expect, it } from 'vitest'
import {
  normalizeUdtName,
  quoteIdent,
  sqliteDdlDialect,
  sqliteFilterDialect,
  toColumns,
  toForeignKeys,
  toIndex,
  toPrimaryKey,
  type ForeignKeyRow,
  type IndexListRow,
  type TableInfoRow
} from '../../../src/main/db/sqlite-shared'

// These back the D1 driver, which cannot be exercised in a unit test without a
// Cloudflare account — so the logic lives here, where it can be.

function column(overrides: Partial<TableInfoRow>): TableInfoRow {
  return { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0, ...overrides }
}

describe('quoteIdent', () => {
  it('double-quotes, and escapes an embedded quote', () => {
    expect(quoteIdent('users')).toBe('"users"')
    expect(quoteIdent('we"ird')).toBe('"we""ird"')
  })
})

describe('normalizeUdtName', () => {
  it('reads SQLite’s advisory type names loosely', () => {
    expect(normalizeUdtName('INTEGER')).toBe('int4')
    expect(normalizeUdtName('BIGINT')).toBe('int4')
    expect(normalizeUdtName('REAL')).toBe('float8')
    expect(normalizeUdtName('NUMERIC(10,2)')).toBe('float8')
    expect(normalizeUdtName('BOOLEAN')).toBe('bool')
    expect(normalizeUdtName('JSON')).toBe('json')
    expect(normalizeUdtName('VARCHAR(255)')).toBe('text')
  })

  it('falls back to text for an untyped column', () => {
    // SQLite allows a column with no declared type at all.
    expect(normalizeUdtName('')).toBe('text')
    expect(normalizeUdtName('   ')).toBe('text')
  })
})

describe('toColumns', () => {
  it('maps a pragma row onto the shared column shape', () => {
    const [col] = toColumns([
      column({ cid: 2, name: 'email', type: 'TEXT', notnull: 1, dflt_value: "'x'", pk: 0 })
    ])
    expect(col).toEqual({
      name: 'email',
      dataType: 'TEXT',
      udtName: 'text',
      isNullable: false,
      isPrimaryKey: false,
      defaultValue: "'x'",
      // pragma cid is 0-based; ordinalPosition is 1-based.
      ordinalPosition: 3,
      characterMaximumLength: null,
      enumValues: null
    })
  })

  it('treats a column with no declared type as TEXT', () => {
    expect(toColumns([column({ type: '' })])[0].dataType).toBe('TEXT')
  })
})

describe('toPrimaryKey', () => {
  it('is empty when nothing is keyed', () => {
    expect(toPrimaryKey([column({ pk: 0 })])).toEqual([])
  })

  it('orders a composite key by its position, not by column order', () => {
    // pragma pk is the 1-based position within the key, so the second column of
    // a composite key can appear first in the table.
    const rows = [
      column({ cid: 0, name: 'b', pk: 2 }),
      column({ cid: 1, name: 'a', pk: 1 }),
      column({ cid: 2, name: 'other', pk: 0 })
    ]
    expect(toPrimaryKey(rows)).toEqual(['a', 'b'])
  })
})

describe('toIndex', () => {
  const index = (o: Partial<IndexListRow>): IndexListRow => ({
    seq: 0,
    name: 'idx',
    unique: 0,
    origin: 'c',
    partial: 0,
    ...o
  })

  it('reads uniqueness and primary-ness from the pragma', () => {
    expect(toIndex(index({ unique: 1 }), []).isUnique).toBe(true)
    expect(toIndex(index({ unique: 0 }), []).isUnique).toBe(false)
    expect(toIndex(index({ origin: 'pk' }), []).isPrimary).toBe(true)
    expect(toIndex(index({ origin: 'u' }), []).isPrimary).toBe(false)
  })

  it('orders index columns by seqno', () => {
    const result = toIndex(index({}), [
      { seqno: 1, cid: 0, name: 'second' },
      { seqno: 0, cid: 1, name: 'first' }
    ])
    expect(result.columns).toEqual(['first', 'second'])
  })
})

describe('toForeignKeys', () => {
  const fk = (o: Partial<ForeignKeyRow>): ForeignKeyRow => ({
    id: 0,
    seq: 0,
    table: 'parent',
    from: 'parent_id',
    to: 'id',
    on_update: 'NO ACTION',
    on_delete: 'CASCADE',
    ...o
  })

  it('maps a single-column key', () => {
    expect(toForeignKeys([fk({})])).toEqual([
      {
        name: 'fk_0',
        columns: ['parent_id'],
        referencedSchema: 'main',
        referencedTable: 'parent',
        referencedColumns: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION'
      }
    ])
  })

  it('regroups a composite key in seq order', () => {
    // The pragma returns one row per column pair; out-of-order rows would pair
    // the columns up wrongly.
    const result = toForeignKeys([
      fk({ id: 0, seq: 1, from: 'b_from', to: 'b_to' }),
      fk({ id: 0, seq: 0, from: 'a_from', to: 'a_to' })
    ])
    expect(result).toHaveLength(1)
    expect(result[0].columns).toEqual(['a_from', 'b_from'])
    expect(result[0].referencedColumns).toEqual(['a_to', 'b_to'])
  })

  it('keeps separate keys separate', () => {
    const result = toForeignKeys([
      fk({ id: 0, from: 'a', table: 'x' }),
      fk({ id: 1, from: 'b', table: 'y' })
    ])
    expect(result.map((r) => r.name)).toEqual(['fk_0', 'fk_1'])
    expect(result.map((r) => r.referencedTable)).toEqual(['x', 'y'])
  })
})

describe('the dialects', () => {
  it('drops the schema, since SQLite has none', () => {
    expect(sqliteDdlDialect.qualifiedTable('main', 'users')).toBe('"users"')
    expect(sqliteDdlDialect.dropIndex('main', 'users', 'idx')).toBe('DROP INDEX "idx"')
  })

  it('clears a table with DELETE, having no TRUNCATE', () => {
    expect(sqliteDdlDialect.truncate('main', 'users')).toBe('DELETE FROM "users"')
  })

  it('binds positionally and folds ilike, matching the engine', () => {
    expect(sqliteFilterDialect.placeholder(1)).toBe('?')
    expect(sqliteFilterDialect.placeholder(7)).toBe('?')
    expect(sqliteFilterDialect.supportsIlike).toBe(false)
  })
})

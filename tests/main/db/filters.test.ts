import { describe, expect, it } from 'vitest'
import { buildFilterSql, type FilterDialect } from '../../../src/main/db/filters'
import type { RowFilter } from '../../../src/shared/types'

const columns = new Set(['id', 'name', 'deleted_at'])

const postgres: FilterDialect = {
  quoteIdent: (name) => `"${name.replace(/"/g, '""')}"`,
  placeholder: (position) => `$${position}`,
  supportsIlike: true
}

const mysql: FilterDialect = {
  quoteIdent: (name) => '`' + name.replace(/`/g, '``') + '`',
  placeholder: () => '?',
  supportsIlike: false
}

describe('buildFilterSql', () => {
  it('returns nothing to append when there are no filters', () => {
    expect(buildFilterSql(undefined, columns, postgres)).toEqual({ whereSql: '', params: [] })
    expect(buildFilterSql([], columns, postgres)).toEqual({ whereSql: '', params: [] })
  })

  it('binds values rather than interpolating them', () => {
    const { whereSql, params } = buildFilterSql(
      [{ column: 'name', operator: '=', value: "o'brien" }],
      columns,
      postgres
    )
    expect(whereSql).toBe('where "name" = $1')
    expect(params).toEqual(["o'brien"])
  })

  it('numbers placeholders in order and joins with and', () => {
    const { whereSql, params } = buildFilterSql(
      [
        { column: 'id', operator: '>', value: '10' },
        { column: 'name', operator: 'like', value: '%bo%' }
      ],
      columns,
      postgres
    )
    expect(whereSql).toBe('where "id" > $1 and "name" like $2')
    expect(params).toEqual(['10', '%bo%'])
  })

  it('writes unary operators without a placeholder', () => {
    const { whereSql, params } = buildFilterSql(
      [
        { column: 'deleted_at', operator: 'is null' },
        { column: 'id', operator: '=', value: '1' }
      ],
      columns,
      postgres
    )
    // The null test must not consume a placeholder number, or the bound value
    // that follows lands on the wrong parameter.
    expect(whereSql).toBe('where "deleted_at" is null and "id" = $1')
    expect(params).toEqual(['1'])
  })

  it('drops a unary filter’s stray value instead of binding it', () => {
    const { params } = buildFilterSql(
      [{ column: 'deleted_at', operator: 'is not null', value: 'leftover' }],
      columns,
      postgres
    )
    expect(params).toEqual([])
  })

  describe('rejecting what it was not given', () => {
    it('skips a column the table does not have', () => {
      const filters: RowFilter[] = [
        { column: 'nope', operator: '=', value: 'x' },
        { column: 'id', operator: '=', value: '1' }
      ]
      const { whereSql, params } = buildFilterSql(filters, columns, postgres)
      // One stale filter must not take the whole page down with it.
      expect(whereSql).toBe('where "id" = $1')
      expect(params).toEqual(['1'])
    })

    it('skips an operator outside the allowlist', () => {
      const filters = [{ column: 'id', operator: '; drop table users --' } as unknown as RowFilter]
      expect(buildFilterSql(filters, columns, postgres)).toEqual({ whereSql: '', params: [] })
    })

    it('skips a binary operator with no value', () => {
      expect(buildFilterSql([{ column: 'id', operator: '=' }], columns, postgres)).toEqual({
        whereSql: '',
        params: []
      })
    })

    it('quotes identifiers so a crafted column name cannot break out', () => {
      const withQuote = new Set(['we"ird'])
      const { whereSql } = buildFilterSql(
        [{ column: 'we"ird', operator: '=', value: '1' }],
        withQuote,
        postgres
      )
      expect(whereSql).toBe('where "we""ird" = $1')
    })
  })

  describe('how several filters combine', () => {
    const two = [
      { column: 'id', operator: '=' as const, value: '1' },
      { column: 'name', operator: '=' as const, value: 'a' }
    ]

    it('ands them by default', () => {
      expect(buildFilterSql(two, columns, postgres).whereSql).toBe(
        'where "id" = $1 and "name" = $2'
      )
    })

    it('ors them when asked, wrapped so the set stays one unit', () => {
      // Without the parentheses, anything appended later would bind to the last
      // OR branch instead of the whole set.
      expect(buildFilterSql(two, columns, postgres, 'or').whereSql).toBe(
        'where ("id" = $1 or "name" = $2)'
      )
    })

    it('does not parenthesise a single filter', () => {
      expect(buildFilterSql([two[0]], columns, postgres, 'or').whereSql).toBe('where "id" = $1')
    })

    it('numbers placeholders the same either way', () => {
      expect(buildFilterSql(two, columns, postgres, 'or').params).toEqual(['1', 'a'])
    })
  })

  describe('per-engine differences', () => {
    it('keeps ilike where the engine has it', () => {
      const { whereSql } = buildFilterSql(
        [{ column: 'name', operator: 'ilike', value: '%a%' }],
        columns,
        postgres
      )
      expect(whereSql).toBe('where "name" ilike $1')
    })

    it('folds ilike onto like where it does not', () => {
      const { whereSql } = buildFilterSql(
        [{ column: 'name', operator: 'ilike', value: '%a%' }],
        columns,
        mysql
      )
      expect(whereSql).toBe('where `name` like ?')
    })

    it('uses the engine’s placeholder and quoting throughout', () => {
      const { whereSql, params } = buildFilterSql(
        [
          { column: 'id', operator: '>=', value: '1' },
          { column: 'name', operator: '!=', value: 'x' }
        ],
        columns,
        mysql
      )
      expect(whereSql).toBe('where `id` >= ? and `name` != ?')
      expect(params).toEqual(['1', 'x'])
    })
  })
})

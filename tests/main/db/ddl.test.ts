import { describe, expect, it } from 'vitest'
import { buildDdl, type DdlDialect } from '../../../src/main/db/ddl'

// Mirrors the Postgres dialect; the D1 variant below covers the schema-less case.
const pg: DdlDialect = {
  quoteIdent: (name) => `"${name.replace(/"/g, '""')}"`,
  qualifiedTable: (schema, table) => `"${schema}"."${table}"`,
  dropIndex: (schema, _table, name) => `DROP INDEX "${schema}"."${name}"`,
  truncate: (schema, table) => `TRUNCATE TABLE "${schema}"."${table}"`
}

const d1: DdlDialect = {
  quoteIdent: pg.quoteIdent,
  qualifiedTable: (_schema, table) => `"${table}"`,
  dropIndex: (_schema, _table, name) => `DROP INDEX "${name}"`,
  truncate: (_schema, table) => `DELETE FROM "${table}"`
}

describe('buildDdl', () => {
  it('adds a column with nullability and default', () => {
    expect(
      buildDdl(
        { kind: 'add-column', name: 'email', dataType: 'text', isNullable: true },
        'public',
        'users',
        pg
      )
    ).toBe('ALTER TABLE "public"."users" ADD COLUMN "email" text')

    expect(
      buildDdl(
        {
          kind: 'add-column',
          name: 'created_at',
          dataType: 'timestamptz',
          isNullable: false,
          defaultValue: 'now()'
        },
        'public',
        'users',
        pg
      )
    ).toBe(
      'ALTER TABLE "public"."users" ADD COLUMN "created_at" timestamptz NOT NULL DEFAULT now()'
    )
  })

  it('drops and renames columns', () => {
    expect(buildDdl({ kind: 'drop-column', name: 'email' }, 'public', 'users', pg)).toBe(
      'ALTER TABLE "public"."users" DROP COLUMN "email"'
    )
    expect(
      buildDdl({ kind: 'rename-column', from: 'email', to: 'mail' }, 'public', 'users', pg)
    ).toBe('ALTER TABLE "public"."users" RENAME COLUMN "email" TO "mail"')
  })

  it('renames and drops tables', () => {
    expect(buildDdl({ kind: 'rename-table', to: 'people' }, 'public', 'users', pg)).toBe(
      'ALTER TABLE "public"."users" RENAME TO "people"'
    )
    expect(buildDdl({ kind: 'drop-table' }, 'public', 'users', pg)).toBe(
      'DROP TABLE "public"."users"'
    )
  })

  it('creates indexes, unique and not', () => {
    expect(
      buildDdl(
        { kind: 'create-index', name: 'users_email_idx', columns: ['email'], isUnique: false },
        'public',
        'users',
        pg
      )
    ).toBe('CREATE INDEX "users_email_idx" ON "public"."users" ("email")')

    expect(
      buildDdl(
        {
          kind: 'create-index',
          name: 'users_email_key',
          columns: ['email', 'tenant_id'],
          isUnique: true
        },
        'public',
        'users',
        pg
      )
    ).toBe('CREATE UNIQUE INDEX "users_email_key" ON "public"."users" ("email", "tenant_id")')
  })

  it('uses the dialect for DROP INDEX and TRUNCATE', () => {
    expect(buildDdl({ kind: 'drop-index', name: 'i' }, 'public', 'users', pg)).toBe(
      'DROP INDEX "public"."i"'
    )
    expect(buildDdl({ kind: 'truncate-table' }, 'public', 'users', pg)).toBe(
      'TRUNCATE TABLE "public"."users"'
    )

    // SQLite has no schemas and no TRUNCATE.
    expect(buildDdl({ kind: 'drop-index', name: 'i' }, 'main', 'users', d1)).toBe('DROP INDEX "i"')
    expect(buildDdl({ kind: 'truncate-table' }, 'main', 'users', d1)).toBe('DELETE FROM "users"')
  })

  it('escapes quotes in identifiers', () => {
    expect(buildDdl({ kind: 'drop-column', name: 'we"ird' }, 'public', 'users', pg)).toBe(
      'ALTER TABLE "public"."users" DROP COLUMN "we""ird"'
    )
  })

  it('rejects missing required values', () => {
    expect(() =>
      buildDdl({ kind: 'add-column', name: '  ', dataType: 'text', isNullable: true }, 'p', 't', pg)
    ).toThrow(/Column name is required/)
    expect(() =>
      buildDdl({ kind: 'add-column', name: 'a', dataType: '', isNullable: true }, 'p', 't', pg)
    ).toThrow(/Data type is required/)
    expect(() => buildDdl({ kind: 'rename-table', to: '' }, 'p', 't', pg)).toThrow(
      /New table name is required/
    )
    expect(() =>
      buildDdl({ kind: 'create-index', name: 'i', columns: ['  '], isUnique: false }, 'p', 't', pg)
    ).toThrow(/At least one column is required/)
  })
})

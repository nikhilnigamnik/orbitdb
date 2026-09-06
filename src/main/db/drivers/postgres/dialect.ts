/**
 * Identifier quoting and the three dialects built on it. No database access,
 * which is what makes them safe to import from anywhere else in the driver.
 */

import { type DdlDialect } from '../../ddl'
import { type FilterDialect } from '../../filters'
import { type ValueSearchDialect } from '../../value-search'

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}
export function qualifiedTable(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}
export const filterDialect: FilterDialect = {
  quoteIdent,
  placeholder: (position) => `$${position}`,
  supportsIlike: true
}
export const searchDialect: ValueSearchDialect = {
  ...filterDialect,
  qualifiedTable,
  castText: (expr) => `${expr}::text`
}
export const ddlDialect: DdlDialect = {
  quoteIdent,
  qualifiedTable,
  dropIndex: (schema, _table, name) => `DROP INDEX ${quoteIdent(schema)}.${quoteIdent(name)}`,
  truncate: (schema, table) => `TRUNCATE TABLE ${qualifiedTable(schema, table)}`
}

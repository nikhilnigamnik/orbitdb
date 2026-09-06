/**
 * The few shapes the grid and the hooks behind it both need.
 *
 * Here rather than in data-grid.tsx so a hook can name them without importing
 * the component that uses it.
 */

export type Row = Record<string, unknown>

export interface ForeignKeyTarget {
  schema: string
  table: string
  column: string
}

/** The three columns the grid adds around the data. */
export const SELECT_COLUMN_ID = '__select__'
export const INDEX_COLUMN_ID = '__index__'
export const ACTIONS_COLUMN_ID = '__actions__'

/**
 * What introspection reports about a database: schemas, tables, columns and keys.
 */

export interface SchemaInfo {
  name: string
}

export interface TableInfo {
  schema: string
  name: string
  type: 'table' | 'view' | 'materialized_view'
  estimatedRows: number | null
}

export interface ColumnInfo {
  name: string
  dataType: string
  udtName: string
  isNullable: boolean
  isPrimaryKey: boolean
  defaultValue: string | null
  ordinalPosition: number
  characterMaximumLength: number | null
  /** Allowed values for enum columns (Postgres enum types, MySQL enum); null otherwise. */
  enumValues: string[] | null
}

export interface IndexInfo {
  name: string
  isUnique: boolean
  isPrimary: boolean
  columns: string[]
  definition: string
}

export interface ForeignKeyInfo {
  name: string
  columns: string[]
  referencedSchema: string
  referencedTable: string
  referencedColumns: string[]
  onDelete: string
  onUpdate: string
}

/**
 * A foreign key seen from the far end: one that *points at* the table being
 * described. `referencedSchema`/`referencedTable` are therefore that table, and
 * `schema`/`table` name the child holding the constraint.
 */
export interface ReferencingKeyInfo extends ForeignKeyInfo {
  schema: string
  table: string
}

export interface TableDetails {
  schema: string
  name: string
  type: 'table' | 'view' | 'materialized_view'
  columns: ColumnInfo[]
  primaryKey: string[]
  indexes: IndexInfo[]
  foreignKeys: ForeignKeyInfo[]
  estimatedRows: number | null
}

export interface SchemaGraphColumn {
  name: string
  dataType: string
  /**
   * The engine's own type name. Postgres reports `dataType` as `USER-DEFINED`
   * for an enum, so without this the type is unidentifiable from the graph.
   */
  udtName: string
  isNullable: boolean
  isPrimaryKey: boolean
  /** Allowed values for enum columns; null otherwise. Mirrors `ColumnInfo`. */
  enumValues: string[] | null
}

export interface SchemaGraphTable {
  schema: string
  name: string
  columns: SchemaGraphColumn[]
}

export interface SchemaGraphEdge {
  name: string
  from: { schema: string; table: string; columns: string[] }
  to: { schema: string; table: string; columns: string[] }
}

export interface SchemaGraph {
  schema: string
  tables: SchemaGraphTable[]
  edges: SchemaGraphEdge[]
}

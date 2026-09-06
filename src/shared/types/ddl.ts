/**
 * Structure edits, as a discriminated union each driver builds SQL from.
 */

export type DdlOperation =
  | {
      kind: 'add-column'
      name: string
      dataType: string
      isNullable: boolean
      defaultValue?: string | null
    }
  | { kind: 'drop-column'; name: string }
  | { kind: 'rename-column'; from: string; to: string }
  | { kind: 'rename-table'; to: string }
  | { kind: 'create-index'; name: string; columns: string[]; isUnique: boolean }
  | { kind: 'drop-index'; name: string }
  | { kind: 'truncate-table' }
  | { kind: 'drop-table' }

export type DdlOperationKind = DdlOperation['kind']

/**
 * The operations the DDL form can build. Truncate and drop are table-wide and
 * take no form input - they go through their own confirm flow, which shows the
 * SQL and names the consequence.
 */
export type DdlFormKind = Exclude<DdlOperationKind, 'truncate-table' | 'drop-table'>

export interface DdlRequest {
  connectionId: string
  schema: string
  table: string
  operation: DdlOperation
}

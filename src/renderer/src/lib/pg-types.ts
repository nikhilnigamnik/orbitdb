/**
 * The Postgres type OIDs that change how a value should be rendered.
 *
 * `QueryResult.fields[].dataTypeID` carries a Postgres OID whatever the engine:
 * the MySQL driver translates mysql2's own column types to the OIDs here (date,
 * timestamp, json) and reports 0 for the rest, since its numbers collide with
 * these - its BIT is 16, the bool OID. D1 reports 0 for everything. An unknown
 * id yields no type and the value renders plainly.
 */
const PG_OID: Record<number, string> = {
  1082: 'date',
  1114: 'timestamp',
  1184: 'timestamptz',
  114: 'json',
  3802: 'jsonb',
  16: 'bool',
  2950: 'uuid'
}

export function pgTypeToUdt(dataTypeID: number | undefined): string | undefined {
  return dataTypeID == null ? undefined : PG_OID[dataTypeID]
}

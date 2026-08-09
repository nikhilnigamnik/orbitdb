/**
 * The Postgres type OIDs that change how a value should be rendered.
 *
 * `QueryResult.fields[].dataTypeID` carries the driver's type id. For Postgres
 * that is a stable OID; MySQL reports its own column-type numbers and D1 reports
 * nothing, so an unknown id simply yields no type and the value renders plainly.
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

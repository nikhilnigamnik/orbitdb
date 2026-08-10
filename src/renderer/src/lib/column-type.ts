/**
 * The type to show against a column.
 *
 * Postgres reports `information_schema.data_type`, which is the SQL standard
 * spelling - verbose (`timestamp with time zone`) and sometimes not a type name
 * at all: `USER-DEFINED` for enums and composites, `ARRAY` for arrays. The real
 * name is in `udt_name`.
 *
 * MySQL is the other way round: its `dataType` carries the useful precision
 * (`varchar(255)`) while `udtName` is normalised for the editor's benefit. So
 * this narrows the Postgres cases and otherwise leaves the engine's own label
 * alone.
 */

/** Verbose SQL-standard spellings, and what Postgres itself calls them. */
const SHORT_FORM: Record<string, string> = {
  'timestamp with time zone': 'timestamptz',
  'timestamp without time zone': 'timestamp',
  'time with time zone': 'timetz',
  'time without time zone': 'time',
  'character varying': 'varchar',
  character: 'char',
  'double precision': 'float8',
  'bit varying': 'varbit'
}

/** Placeholders that stand in for a type rather than naming one. */
const PLACEHOLDER = new Set(['user-defined', 'array'])

export function formatColumnType(dataType: string, udtName?: string): string {
  const raw = (dataType ?? '').trim()
  if (!raw) return udtName ?? ''

  const lowered = raw.toLowerCase()
  if (PLACEHOLDER.has(lowered) && udtName) {
    // An enum's own name says far more than "USER-DEFINED"; a Postgres array's
    // udt_name is the element type prefixed with an underscore.
    return udtName.startsWith('_') ? `${udtName.slice(1)}[]` : udtName
  }

  return SHORT_FORM[lowered] ?? raw
}

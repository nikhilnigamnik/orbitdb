import type { ColumnInfo, RowFilter } from '../../shared/types'

/** A filter as the model returned it, before any of it has been trusted. */
export interface RawFilter {
  column: string
  operator: RowFilter['operator']
  value?: string
}

export interface RepairedFilters {
  filters: RowFilter[]
  /** Why a condition was dropped, phrased for the user. Empty when nothing was. */
  notes: string[]
}

// A value that still smells like SQL would be bound as a literal and fail to cast.
const LOOKS_LIKE_EXPRESSION = /\b(now|current_date|current_timestamp|interval|date_trunc)\b|\(\)/i

const NO_VALUE_OPERATORS: ReadonlySet<RowFilter['operator']> = new Set(['is null', 'is not null'])
const WILDCARD_OPERATORS: ReadonlySet<RowFilter['operator']> = new Set(['like', 'ilike'])

/** Lowercased, punctuation-free form - turns `status_change` and `STATUS-CHANGE` alike. */
function squash(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Resolve a model-supplied value onto a real enum label, or null if none fits.
 *
 * Exact match is tried first so an enum holding both 'Update' and 'update' -
 * legal in Postgres - resolves to whichever was actually asked for. There is
 * deliberately no fuzzy scoring below the punctuation tier: a near-miss that
 * snaps to the wrong label silently answers a different question, which is worse
 * than dropping the condition and saying so.
 */
export function snapEnumValue(value: string, labels: string[]): string | null {
  if (!value) return null
  if (labels.includes(value)) return value

  const lower = value.trim().toLowerCase()
  if (!lower) return null
  const caseMatch = labels.find((l) => l.trim().toLowerCase() === lower)
  if (caseMatch) return caseMatch

  const squashed = squash(value)
  if (!squashed) return null
  // A label that is entirely punctuation squashes to '' and must not match here.
  return labels.find((l) => squash(l) !== '' && squash(l) === squashed) ?? null
}

/**
 * Make the model's filters executable, or drop the ones that cannot be.
 *
 * An enum's input domain is closed and already known from introspection, so a
 * value outside it is *guaranteed* to fail at the driver - there is no reason to
 * spend a round-trip discovering that. Snapping the case here is what turns the
 * model's plausible `action = 'update'` into the `action = 'Update'` the database
 * will accept.
 */
export function repairFilters(raw: RawFilter[], columns: ColumnInfo[]): RepairedFilters {
  const byName = new Map(columns.map((c) => [c.name, c]))
  const filters: RowFilter[] = []
  const notes: string[] = []

  for (const f of raw) {
    const column = byName.get(f.column)
    if (!column) continue // hallucinated column

    if (NO_VALUE_OPERATORS.has(f.operator)) {
      // Carries no value: nothing to snap, and legal on every column type.
      filters.push({ column: f.column, operator: f.operator })
      continue
    }

    if (f.value && LOOKS_LIKE_EXPRESSION.test(f.value)) continue

    const labels = column.enumValues
    if (!labels?.length) {
      filters.push({ column: f.column, operator: f.operator, value: f.value })
      continue
    }

    if (f.value == null) continue // binary operator with no value is dead anyway

    // `enum ILIKE text` is "operator does not exist" in Postgres, so a wildcard
    // match can never run. Stripping the wildcards recovers the intent instead.
    const isWildcard = WILDCARD_OPERATORS.has(f.operator)
    const wanted = isWildcard ? f.value.replace(/^%+|%+$/g, '') : f.value
    const snapped = snapEnumValue(wanted, labels)

    if (!snapped) {
      notes.push(`No value of "${f.column}" matches "${f.value}" - that condition was dropped.`)
      continue
    }

    filters.push({
      column: f.column,
      // Ordering operators stay: Postgres enums are totally ordered by
      // enumsortorder, so `action > 'Login'` is legal once the value is real.
      operator: isWildcard ? '=' : f.operator,
      value: snapped
    })
  }

  return { filters, notes }
}

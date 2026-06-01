import { z } from 'zod'
import type { FilterTableOptions, FilterTableResult, RowFilter } from '../../shared/types'
import { getConnection } from '../store/connections-store'
import { tableDetails } from '../db/manager'
import { generateJson } from './client'
import { buildTableContext, ENGINE_DIALECT } from './context'

const OPERATORS = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'like',
  'ilike',
  'is null',
  'is not null'
] as const

const responseSchema = z.object({
  filters: z.array(
    z.object({
      column: z.string(),
      operator: z.enum(OPERATORS),
      value: z.string().optional()
    })
  ),
  orderBy: z.string().nullish(),
  orderDir: z.enum(['asc', 'desc']).nullish()
})

export async function filterTable(opts: FilterTableOptions): Promise<FilterTableResult> {
  const saved = getConnection(opts.connectionId)
  if (!saved) throw new Error(`Connection ${opts.connectionId} not found`)

  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const context = buildTableContext(details)
  const columnNames = new Set(details.columns.map((c) => c.name))

  const nowIso = new Date().toISOString()

  const response = await generateJson({
    schema: responseSchema,
    system:
      `You translate a natural-language request into structured filters and sorting for a single ` +
      `${ENGINE_DIALECT[saved.engine]} table. You CANNOT aggregate, join, or group — only filter rows ` +
      `and optionally sort by one column. ` +
      `Use only the exact column names from the schema. ` +
      `Each filter is {column, operator, value}; operators are ${OPERATORS.join(', ')}. ` +
      `Omit "value" for "is null"/"is not null". Combine multiple conditions as separate filters (ANDed). ` +
      `For text matching prefer "ilike" with % wildcards. ` +
      `CRITICAL: every "value" is bound as a literal parameter, NOT raw SQL. ` +
      `Never use SQL functions or expressions (no now(), CURRENT_DATE, interval, etc.). ` +
      `The current date/time is ${nowIso}. Express relative dates as concrete ISO 8601 literals ` +
      `computed from that (e.g. "rows from the last 7 days" → a literal timestamp 7 days before now). ` +
      `Return JSON {filters: [...], orderBy?: column, orderDir?: "asc"|"desc"}.`,
    prompt: `Table:\n${context}\n\nRequest: ${opts.prompt}`
  })

  // Drop filters on unknown columns (hallucinations) or whose value still smells like
  // a SQL expression — those would be sent as a literal and fail to cast.
  const looksLikeExpression = /\b(now|current_date|current_timestamp|interval|date_trunc)\b|\(\)/i
  const filters: RowFilter[] = response.filters.filter(
    (f) => columnNames.has(f.column) && !(f.value && looksLikeExpression.test(f.value))
  )
  const orderBy =
    response.orderBy && columnNames.has(response.orderBy) ? response.orderBy : undefined

  return {
    filters,
    orderBy,
    orderDir: orderBy ? (response.orderDir ?? 'asc') : undefined
  }
}

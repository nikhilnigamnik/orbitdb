import { generateText } from 'ai'
import type { GenerateSqlOptions, GenerateSqlResult } from '../../shared/types'
import { getConnection } from '../store/connections-store'
import { aiModel, stripFences } from './client'
import { buildSchemaContext, ENGINE_DIALECT, QUOTE_HINT } from './context'

export async function generateSql(opts: GenerateSqlOptions): Promise<GenerateSqlResult> {
  const saved = getConnection(opts.connectionId)
  if (!saved) throw new Error(`Connection ${opts.connectionId} not found`)

  const dialect = ENGINE_DIALECT[saved.engine]
  const schemaContext = await buildSchemaContext(opts.connectionId, saved.engine)

  const { text } = await generateText({
    model: aiModel,
    system:
      `You are an expert SQL assistant for ${dialect}. ` +
      `Generate exactly one valid ${dialect} query that answers the user's request. ` +
      `Use only the tables and columns from the provided schema. ` +
      `${QUOTE_HINT[saved.engine]} ` +
      `Prefer read-only SELECT queries unless the user clearly asks to modify data. ` +
      `Respond with the raw SQL only — no prose, no explanation, no markdown code fences.`,
    prompt:
      (schemaContext
        ? `Database schema:\n${schemaContext}\n\n`
        : 'No schema information is available; infer reasonable table and column names.\n\n') +
      `Request: ${opts.prompt}`
  })

  return { sql: stripFences(text), explanation: '' }
}

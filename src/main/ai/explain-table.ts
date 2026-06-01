import { generateText } from 'ai'
import type { ExplainTableOptions, ExplainTableResult } from '../../shared/types'
import { getConnection } from '../store/connections-store'
import { tableDetails } from '../db/manager'
import { aiModel } from './client'
import { buildTableContext, ENGINE_DIALECT } from './context'

export async function explainTable(opts: ExplainTableOptions): Promise<ExplainTableResult> {
  const saved = getConnection(opts.connectionId)
  if (!saved) throw new Error(`Connection ${opts.connectionId} not found`)

  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const context = buildTableContext(details)

  const { text } = await generateText({
    model: aiModel,
    system:
      `You are a database expert explaining a ${ENGINE_DIALECT[saved.engine]} table to a developer. ` +
      `Format your answer in concise Markdown: a one-line summary, then short sections with ` +
      `bold labels or small headings, bullet lists for columns, and \`inline code\` for column ` +
      `and table names. Cover what the table most likely represents, the role of each notable ` +
      `column, and how it relates to other tables via its foreign keys. ` +
      `Keep it under ~180 words and infer meaning from names and types.`,
    prompt: `Explain this table:\n\n${context}`
  })

  return { explanation: text.trim() }
}

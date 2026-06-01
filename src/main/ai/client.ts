import { createGroq } from '@ai-sdk/groq'
import { generateText, Output } from 'ai'
import type { z } from 'zod'
import { GROQ_API_KEY, GROQ_MODEL } from './config'

const groq = createGroq({ apiKey: GROQ_API_KEY })

export const aiModel = groq(GROQ_MODEL)

// Strip ```sql / ```json fences some models add despite instructions.
export function stripFences(text: string): string {
  const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/i)
  return (fenced ? fenced[1] : text).trim()
}

// Pull the first JSON object/array out of a reply that may include a preamble
// (reasoning models like to prefix "Here's the JSON:" before the payload).
function extractJson(text: string): string {
  const objStart = text.indexOf('{')
  const arrStart = text.indexOf('[')
  if (objStart === -1 && arrStart === -1) return text
  const useArray = objStart === -1 || (arrStart !== -1 && arrStart < objStart)
  const start = useArray ? arrStart : objStart
  const end = text.lastIndexOf(useArray ? ']' : '}')
  return end > start ? text.slice(start, end + 1) : text
}

/**
 * Structured output with two layers of defense:
 * 1. The provider's native `json_schema` mode (gpt-oss models support it).
 * 2. If that's unavailable/fails, fall back to plain text + defensive JSON
 *    extraction and zod validation.
 */
export async function generateJson<T>(opts: {
  schema: z.ZodType<T>
  system: string
  prompt: string
}): Promise<T> {
  try {
    const { output } = await generateText({
      model: aiModel,
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema })
    })
    if (output != null) return output as T
  } catch {
    // fall through to the manual path
  }

  const { text } = await generateText({
    model: aiModel,
    system: `${opts.system}\n\nRespond with raw JSON only — no prose, no markdown code fences.`,
    prompt: opts.prompt
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(stripFences(text)))
  } catch {
    throw new Error('The model returned invalid JSON. Try rephrasing your request.')
  }

  const result = opts.schema.safeParse(parsed)
  if (!result.success) {
    throw new Error('The model response did not match the expected shape. Try again.')
  }
  return result.data
}

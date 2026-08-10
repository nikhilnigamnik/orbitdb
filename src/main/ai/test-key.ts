import { runText } from './client'
import { AI_REQUEST_TIMEOUT_MS } from './config'

/**
 * One real, deliberately tiny call against a named provider - not necessarily the
 * active one, since each provider card has its own button. Mirrors "Test
 * connection" on the connections page: a bad key should fail here, on a button
 * the user pressed, rather than halfway through generating SQL.
 */
export async function testAiKey(provider: string): Promise<void> {
  await runText(
    'test-key',
    {
      prompt: 'Reply with the single word: ok',
      maxOutputTokens: 8,
      abortSignal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS)
    },
    provider
  )
}

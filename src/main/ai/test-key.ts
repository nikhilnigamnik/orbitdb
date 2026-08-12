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
      // Deliberately the same request shape the real features send. It used to
      // cap `maxOutputTokens`, which no other endpoint does - and OpenAI models
      // reached through Cloudflare reject `max_tokens` in favour of
      // `max_completion_tokens`, so the test failed where genuine usage would
      // have worked. A diagnostic that fails differently from the thing it is
      // diagnosing is worse than no diagnostic. The prompt is what keeps the
      // reply short.
      prompt: 'Reply with the single word: ok',
      abortSignal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS)
    },
    provider
  )
}

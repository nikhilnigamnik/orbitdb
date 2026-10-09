import { describe, expect, it } from 'vitest'
import {
  INCOMPLETE_GATEWAY_MESSAGE,
  MISSING_AI_KEY_MESSAGE,
  isAiSetupMessage
} from '../../src/shared/ai-models'

describe('isAiSetupMessage', () => {
  it('recognises a missing key', () => {
    expect(isAiSetupMessage(MISSING_AI_KEY_MESSAGE)).toBe(true)
  })

  it('recognises a half-configured gateway, which used to surface as a raw error', () => {
    expect(isAiSetupMessage(INCOMPLETE_GATEWAY_MESSAGE)).toBe(true)
  })

  it('leaves every other failure as an error', () => {
    expect(isAiSetupMessage('401 Unauthorized')).toBe(false)
    expect(isAiSetupMessage('')).toBe(false)
    expect(isAiSetupMessage(null)).toBe(false)
    expect(isAiSetupMessage(undefined)).toBe(false)
  })
})

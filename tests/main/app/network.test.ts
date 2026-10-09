import {
  getDefaultAutoSelectFamilyAttemptTimeout,
  setDefaultAutoSelectFamilyAttemptTimeout
} from 'net'
import { afterEach, expect, it } from 'vitest'

import { ADDRESS_ATTEMPT_TIMEOUT_MS, configureNetwork } from '../../../src/main/app/network'

const original = getDefaultAutoSelectFamilyAttemptTimeout()
afterEach(() => setDefaultAutoSelectFamilyAttemptTimeout(original))

it('gives each address long enough for a slow link to answer', () => {
  configureNetwork()
  expect(getDefaultAutoSelectFamilyAttemptTimeout()).toBe(ADDRESS_ATTEMPT_TIMEOUT_MS)
  // Node's 250 ms default abandoned a 275 ms round trip every time.
  expect(ADDRESS_ATTEMPT_TIMEOUT_MS).toBeGreaterThanOrEqual(1_000)
  // Short of the drivers' 8 s connect timeout, so a dead address costs little.
  expect(ADDRESS_ATTEMPT_TIMEOUT_MS).toBeLessThan(8_000)
})

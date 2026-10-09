import { describe, expect, it } from 'vitest'

import { describeError } from '../../../src/main/db/describe-error'

function errno(code: string, message = ''): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code })
}

describe('describeError', () => {
  it('keeps an ordinary message as it is', () => {
    expect(describeError(new Error('password authentication failed'))).toBe(
      'password authentication failed'
    )
    expect(describeError('plain string')).toBe('plain string')
  })

  it('reads the parts of an AggregateError, whose own message is empty', () => {
    // What Node throws when every address of a host failed to connect.
    const err = new AggregateError(
      [
        errno('ETIMEDOUT', 'connect ETIMEDOUT 52.45.105.76:5432'),
        errno('ENETUNREACH', 'connect ENETUNREACH 2600:1f10::1:5432')
      ],
      ''
    )
    expect(describeError(err)).toBe(
      'Could not reach the server: connect ETIMEDOUT 52.45.105.76:5432; connect ENETUNREACH 2600:1f10::1:5432'
    )
  })

  it('falls back to the error code when there is no message anywhere', () => {
    expect(describeError(new AggregateError([errno('ETIMEDOUT')], ''))).toBe(
      'Could not reach the server: the connection timed out (ETIMEDOUT)'
    )
    expect(describeError(errno('ECONNREFUSED'))).toBe('Could not reach the server: ECONNREFUSED')
  })

  it('never returns an empty string', () => {
    expect(describeError(new AggregateError([], ''))).not.toBe('')
  })
})

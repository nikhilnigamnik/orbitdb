import type { OperationResult } from '../types'

export async function unwrap<T>(promise: Promise<OperationResult<T>>): Promise<T> {
  const result = await promise
  if (!result.success) {
    throw new Error(result.error ?? 'Unknown error')
  }
  return result.data as T
}

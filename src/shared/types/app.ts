/**
 * The IPC envelope and other app-level shapes.
 */

export interface OperationResult<T = void> {
  success: boolean
  error?: string
  data?: T
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  releaseUrl: string | null
  publishedAt: string | null
}

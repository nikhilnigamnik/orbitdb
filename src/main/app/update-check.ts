import { app } from 'electron'
import type { UpdateCheckResult } from '../../shared/types'

const RELEASES_API = 'https://api.github.com/repos/nikhilnigamnik/orbitdb/releases/latest'

interface GithubRelease {
  tag_name: string
  html_url: string
  published_at: string
  prerelease: boolean
  draft: boolean
}

function stripV(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag
}

function compareSemver(a: string, b: string): number {
  const pa = stripV(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = stripV(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const empty: UpdateCheckResult = {
    currentVersion,
    latestVersion: null,
    hasUpdate: false,
    releaseUrl: null,
    publishedAt: null
  }

  const res = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OrbitDB' }
  })
  // 404 = no published (non-draft, non-prerelease) releases yet. Treat as up-to-date.
  if (res.status === 404) return empty
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}`)
  }

  const release = (await res.json()) as GithubRelease
  if (release.draft || release.prerelease) return empty

  const latestVersion = stripV(release.tag_name)
  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0
  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseUrl: release.html_url,
    publishedAt: release.published_at
  }
}

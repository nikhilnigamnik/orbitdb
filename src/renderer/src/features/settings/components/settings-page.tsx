import * as React from 'react'
import {
  IconRefresh,
  IconCircleCheck,
  IconExternalLink,
  IconBrandGithub,
  IconAlertTriangle
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { unwrap } from '@renderer/lib/ipc'
import { useUpdateCheck } from '@renderer/features/settings/store'
import { APP_NAME, APP_TAGLINE, GITHUB_REPO_URL } from '@renderer/config/site'

function formatRelative(date: Date | null): string {
  if (!date) return 'never'
  const diff = Date.now() - date.getTime()
  const seconds = Math.round(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleString()
}

function formatPublishedAt(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return iso
  }
}

export function SettingsPage() {
  const { version, result, isChecking, error, lastCheckedAt, check } = useUpdateCheck()

  async function openExternal(url: string) {
    try {
      await unwrap(window.api.app.openExternal(url))
    } catch (err) {
      console.error('Failed to open external URL', err)
    }
  }

  const hasUpdate = !!result?.hasUpdate
  const currentVersion = version ?? result?.currentVersion ?? '…'

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-text">Settings</h1>
          <p className="mt-1 text-[12.5px] text-text-subtle">
            Configure how {APP_NAME} runs on this machine.
          </p>
        </div>

        <Section title="About">
          <div className="flex items-center gap-3.5 rounded-lg border border-border bg-surface-elevated/20 p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold tracking-tight text-text">
                  {APP_NAME}
                </span>
                <span className="font-mono text-[11px] text-text-subtle">v{currentVersion}</span>
              </div>
              <p className="text-[12px] text-text-subtle">{APP_TAGLINE}</p>
            </div>
            <button
              type="button"
              onClick={() => void openExternal(GITHUB_REPO_URL)}
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              aria-label="Open GitHub repository"
            >
              <IconBrandGithub size={16} />
            </button>
          </div>
        </Section>

        <Section title="Updates">
          <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated/20">
            <div className="p-4">
              {isChecking ? (
                <div className="flex items-center gap-2.5 text-[13px] text-text-muted">
                  <Spinner size={15} className="text-text-subtle" />
                  Checking for updates…
                </div>
              ) : error ? (
                <div className="flex items-start gap-2.5">
                  <IconAlertTriangle size={15} className="mt-0.5 shrink-0 text-text-subtle" />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[13px] font-medium text-text">
                      Couldn&rsquo;t check for updates
                    </p>
                    <p className="text-[11.5px] text-text-subtle">{error}</p>
                  </div>
                </div>
              ) : hasUpdate && result ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="text-[13px] font-medium text-text">
                        Version {result.latestVersion} is available
                      </p>
                      <p className="text-[11.5px] text-text-subtle">
                        You&rsquo;re on v{result.currentVersion}
                        {result.publishedAt &&
                          ` · Released ${formatPublishedAt(result.publishedAt)}`}
                      </p>
                    </div>
                  </div>
                  {result.releaseUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="self-start border border-border bg-surface text-text-muted hover:bg-surface-elevated hover:text-text"
                      onClick={() => void openExternal(result.releaseUrl!)}
                    >
                      <IconExternalLink size={12} />
                      Open release page
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  <IconCircleCheck size={15} className="mt-0.5 shrink-0 text-text-subtle" />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[13px] font-medium text-text">You&rsquo;re up to date</p>
                    <p className="text-[11.5px] text-text-subtle">
                      Running the latest version (v{currentVersion}).
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <span className="text-[11px] text-text-subtle">
                Last checked {formatRelative(lastCheckedAt)} · via{' '}
                <span className="text-text-muted">GitHub Releases</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={() => void check()}
                disabled={isChecking}
              >
                {isChecking ? (
                  <Spinner size={12} className="text-current" />
                ) : (
                  <IconRefresh size={12} />
                )}
                Check now
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 flex flex-col gap-3">
      <h2 className="text-[10.5px] font-semibold uppercase tracking-wider text-text-subtle">
        {title}
      </h2>
      {children}
    </section>
  )
}

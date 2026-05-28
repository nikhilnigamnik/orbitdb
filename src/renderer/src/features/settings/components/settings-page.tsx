import * as React from 'react'
import {
  IconRefresh,
  IconCircleCheck,
  IconArrowUpRight,
  IconExternalLink
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { unwrap } from '@renderer/lib/ipc'
import { useUpdateCheck } from '@renderer/features/settings/store'
import { Chip } from '@renderer/components/ui/chip'

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
            Configure how OrbitDB runs on this machine.
          </p>
        </div>

        <Section title="About">
          <Row label="Version">
            <Chip tone="neutral">v{currentVersion}</Chip>
          </Row>
        </Section>

        <Section title="Updates">
          <Row label="Update channel">
            <Chip tone="neutral">GitHub Releases</Chip>
          </Row>

          <div className="rounded-lg border border-border bg-surface-elevated/30 p-4">
            {isChecking ? (
              <div className="flex items-center gap-2 text-[12.5px] text-text-muted">
                <IconRefresh size={14} className="animate-spin" />
                Checking for updates…
              </div>
            ) : error ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12.5px] text-red-400">
                  Couldn&rsquo;t check for updates: {error}
                </p>
              </div>
            ) : hasUpdate && result ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300">
                    <IconArrowUpRight size={14} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[13px] font-medium text-text">
                      Version {result.latestVersion} is available
                    </p>
                    <p className="text-[11.5px] text-text-subtle">
                      You&rsquo;re on v{result.currentVersion}
                      {result.publishedAt && ` · Released ${formatPublishedAt(result.publishedAt)}`}
                    </p>
                  </div>
                </div>
                {result.releaseUrl && (
                  <Button
                    size="sm"
                    className="self-start bg-accent text-white hover:bg-accent/90"
                    onClick={() => void openExternal(result.releaseUrl!)}
                  >
                    <IconExternalLink size={12} />
                    Open release page
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-text-subtle">
                  <IconCircleCheck size={14} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[13px] font-medium text-text">You&rsquo;re up to date</p>
                  <p className="text-[11.5px] text-text-subtle">
                    Running the latest version (v{currentVersion}).
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-text-subtle">
              Last checked {formatRelative(lastCheckedAt)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-text-muted hover:bg-surface-elevated hover:text-text"
              onClick={() => void check()}
              disabled={isChecking}
            >
              <IconRefresh size={12} className={isChecking ? 'animate-spin' : ''} />
              Check now
            </Button>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-elevated/30 px-4 py-2.5">
      <span className="text-[12.5px] text-text-muted">{label}</span>
      {children}
    </div>
  )
}

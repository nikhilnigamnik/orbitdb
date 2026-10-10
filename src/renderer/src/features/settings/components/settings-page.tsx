import * as React from 'react'
import {
  IconRefresh,
  IconCircleCheck,
  IconCircleArrowUp,
  IconBrandGithub,
  IconAlertTriangle,
  IconSettings,
  IconInfoCircle,
  IconSparkles,
  IconChartBar,
  IconCloudDownload,
  IconPalette
} from '@tabler/icons-react'
import { format, isValid, parseISO } from 'date-fns'

import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Spinner } from '@renderer/components/ui/spinner'
import { useToast } from '@renderer/components/ui/toast'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { APP_NAME, APP_TAGLINE, GITHUB_REPO_URL } from '@renderer/config/site'
import { formatShortAgo } from '@renderer/features/logs/lib/relative-time'
import { useUpdateCheck } from '@renderer/features/settings/store'

import { AiSettings } from './ai-settings'
import { AppearanceSettings } from './appearance-settings'
import { UpdateActions } from './update-actions'
import { UsageSettings } from './usage-settings'
import { SettingFooter, SettingRow, SettingsCard } from './settings-card'
import { SettingsNav, type SettingsNavItem } from './settings-nav'

function formatPublishedAt(iso: string | null): string {
  if (!iso) return ''
  const date = parseISO(iso)
  return isValid(date) ? format(date, 'd MMM yyyy') : iso
}

const SECTIONS: SettingsNavItem[] = [
  { id: 'about', label: 'About', icon: IconInfoCircle },
  { id: 'appearance', label: 'Appearance', icon: IconPalette },
  { id: 'ai', label: 'AI', icon: IconSparkles },
  { id: 'usage', label: 'AI usage', icon: IconChartBar },
  { id: 'updates', label: 'Updates', icon: IconCloudDownload }
]

/** How far below the top of the scroller a section counts as the one being read. */
const ACTIVE_SECTION_OFFSET = 96

export function SettingsPage() {
  const {
    version,
    result,
    isChecking,
    error,
    lastCheckedAt,
    check,
    download,
    startDownload,
    install
  } = useUpdateCheck()
  const toast = useToast()

  async function openExternal(url: string) {
    try {
      await unwrap(window.api.app.openExternal(url))
    } catch (err) {
      toast.error('Could not open the link', { description: errorMessage(err) })
    }
  }

  const hasUpdate = !!result?.hasUpdate
  const currentVersion = version ?? result?.currentVersion ?? '…'

  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = React.useState(SECTIONS[0].id)

  // The nav follows the reading position: the last section whose top has
  // scrolled past the offset is the current one.
  function handleScroll() {
    const scroller = scrollerRef.current
    if (!scroller) return
    const top = scroller.getBoundingClientRect().top
    let current = SECTIONS[0].id
    for (const { id } of SECTIONS) {
      const el = scroller.querySelector<HTMLElement>(`#settings-${id}`)
      if (el && el.getBoundingClientRect().top - top <= ACTIVE_SECTION_OFFSET) current = id
    }
    // The last section is too short to ever reach the top, so a page scrolled
    // to its end is reading the last one.
    const isAtEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
    if (isAtEnd) current = SECTIONS[SECTIONS.length - 1].id
    setActiveId(current)
  }

  function scrollToSection(id: string) {
    setActiveId(id)
    scrollerRef.current
      ?.querySelector<HTMLElement>(`#settings-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const activeLabel = SECTIONS.find((section) => section.id === activeId)?.label

  return (
    <div className="flex h-full min-h-0 flex-1 bg-surface">
      <SettingsNav items={SECTIONS} activeId={activeId} onSelect={scrollToSection} />

      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          breadcrumbs={[
            { label: 'Settings', icon: <IconSettings /> },
            ...(activeLabel ? [{ label: activeLabel }] : [])
          ]}
        />

        <div ref={scrollerRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-auto">
          <div className="flex w-full flex-col gap-10 px-8 py-8">
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold text-text">Settings</h1>
              <p className="text-xs text-text-muted">
                Configure how {APP_NAME} runs on this machine.
              </p>
            </div>

            <Section
              id="about"
              title="About"
              description="The version you are running and where it comes from."
            >
              <SettingsCard>
                <SettingRow
                  title={
                    <span className="flex items-center gap-2">
                      {APP_NAME}
                      <Chip tone="neutral" className="tabular-nums">
                        v{currentVersion}
                      </Chip>
                    </span>
                  }
                  description={APP_TAGLINE}
                >
                  <Button
                    size="icon-sm"
                    variant="subtle"
                    onClick={() => void openExternal(GITHUB_REPO_URL)}
                    aria-label="Open GitHub repository"
                    title="Open GitHub repository"
                  >
                    <IconBrandGithub size={16} />
                  </Button>
                </SettingRow>
              </SettingsCard>
            </Section>

            <Section
              id="appearance"
              title="Appearance"
              description="How the app looks on this machine."
            >
              <AppearanceSettings />
            </Section>

            <Section
              id="ai"
              title="AI"
              description="The provider the AI features call. Each keeps its own key and model."
            >
              <AiSettings />
            </Section>

            <Section
              id="usage"
              title="AI usage"
              description="Tokens and estimated spend, counted on this machine."
            >
              <UsageSettings />
            </Section>

            <Section
              id="updates"
              title="Updates"
              description="New versions are published on GitHub Releases."
            >
              <SettingsCard>
                <div className="px-4 py-3">
                  {isChecking ? (
                    <div className="flex min-h-8 items-center gap-2.5 text-sm text-text-muted">
                      <Spinner size={16} className="text-text-subtle" />
                      Checking for updates…
                    </div>
                  ) : error ? (
                    <UpdateStatus
                      icon={<IconAlertTriangle size={16} className="text-warning" />}
                      title={<>Couldn&rsquo;t check for updates</>}
                      description={error}
                    />
                  ) : hasUpdate && result ? (
                    <div className="flex items-center justify-between gap-6">
                      <UpdateStatus
                        icon={<IconCircleArrowUp size={16} className="text-accent-text" />}
                        title={<>Version {result.latestVersion} is available</>}
                        description={
                          <>
                            You&rsquo;re on v{result.currentVersion}
                            {result.publishedAt &&
                              ` · Released ${formatPublishedAt(result.publishedAt)}`}
                          </>
                        }
                      />
                      <UpdateActions
                        result={result}
                        download={download}
                        onDownload={() => void startDownload()}
                        onInstall={() => void install()}
                        onOpenRelease={(url) => void openExternal(url)}
                      />
                    </div>
                  ) : (
                    <UpdateStatus
                      icon={<IconCircleCheck size={16} className="text-success" />}
                      title={<>You&rsquo;re up to date</>}
                      description={<>Running the latest version (v{currentVersion}).</>}
                    />
                  )}
                </div>

                <SettingFooter>
                  <span className="text-xs text-text-muted">
                    Last checked {lastCheckedAt ? formatShortAgo(lastCheckedAt) : 'never'} · via{' '}
                    <span className="text-text">GitHub Releases</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void check()}
                    disabled={isChecking}
                  >
                    {isChecking ? (
                      <Spinner size={14} className="text-current" />
                    ) : (
                      <IconRefresh size={14} />
                    )}
                    Check now
                  </Button>
                </SettingFooter>
              </SettingsCard>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  id,
  title,
  description,
  children
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section id={`settings-${id}`} className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {description && <p className="text-xs text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function UpdateStatus({
  icon,
  title,
  description
}: {
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
    </div>
  )
}

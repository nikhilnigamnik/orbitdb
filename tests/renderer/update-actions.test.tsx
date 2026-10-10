// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateActions } from '../../src/renderer/src/features/settings/components/update-actions'
import { UpdateCheckProvider, useUpdateCheck } from '../../src/renderer/src/features/settings/store'
import type { UpdateCheckResult, UpdateDownloadState } from '../../src/renderer/src/types'
import { IDLE_UPDATE_DOWNLOAD } from '../../src/shared/types'

afterEach(cleanup)

const available: UpdateCheckResult = {
  currentVersion: '0.3.0',
  latestVersion: '0.3.1',
  hasUpdate: true,
  releaseUrl: 'https://github.com/nikhilnigamnik/orbitdb/releases/tag/v0.3.1',
  publishedAt: '2026-10-10T05:45:27Z',
  installSupport: 'in-app'
}

function mount(result: UpdateCheckResult, download: UpdateDownloadState) {
  const onDownload = vi.fn()
  const onInstall = vi.fn()
  const onOpenRelease = vi.fn()
  render(
    <UpdateActions
      result={result}
      download={download}
      onDownload={onDownload}
      onInstall={onInstall}
      onOpenRelease={onOpenRelease}
    />
  )
  return { onDownload, onInstall, onOpenRelease }
}

describe('the actions beside an available update', () => {
  it('only links to the release page on a build that cannot install', () => {
    const { onOpenRelease } = mount(
      { ...available, installSupport: 'manual' },
      IDLE_UPDATE_DOWNLOAD
    )
    expect(screen.queryByText('Download update')).toBeNull()
    fireEvent.click(screen.getByText('Open release page'))
    expect(onOpenRelease).toHaveBeenCalledWith(available.releaseUrl)
  })

  it('offers the download, with the notes beside it', () => {
    const { onDownload } = mount(available, IDLE_UPDATE_DOWNLOAD)
    fireEvent.click(screen.getByText('Download update'))
    expect(onDownload).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Release notes')).toBeTruthy()
  })

  it('shows progress as a real progress bar', () => {
    mount(available, {
      ...IDLE_UPDATE_DOWNLOAD,
      phase: 'downloading',
      version: '0.3.1',
      percent: 42.4,
      transferredBytes: 42_400_000,
      totalBytes: 100_000_000
    })
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('42')
    expect(screen.getByText('42%')).toBeTruthy()
    expect(screen.getByText(/Downloading v0.3.1/)).toBeTruthy()
    expect(screen.queryByText('Download update')).toBeNull()
  })

  it('asks to restart once the download has landed', () => {
    const { onInstall } = mount(available, {
      ...IDLE_UPDATE_DOWNLOAD,
      phase: 'downloaded',
      version: '0.3.1',
      percent: 100
    })
    fireEvent.click(screen.getByText('Restart to install'))
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it('shows the failure and lets the download be retried', () => {
    const { onDownload } = mount(available, {
      ...IDLE_UPDATE_DOWNLOAD,
      phase: 'error',
      error: 'ENOTFOUND github.com'
    })
    expect(screen.getByText('ENOTFOUND github.com')).toBeTruthy()
    fireEvent.click(screen.getByText('Try again'))
    expect(onDownload).toHaveBeenCalledTimes(1)
  })
})

function Probe() {
  const { download } = useUpdateCheck()
  return <span data-testid="phase">{download.phase}</span>
}

describe('the store', () => {
  it('mirrors the download state main pushes, and unsubscribes on unmount', async () => {
    let push: ((state: UpdateDownloadState) => void) | null = null
    const off = vi.fn()
    Object.assign(window, {
      api: {
        app: {
          getVersion: async () => ({ success: true, data: '0.3.0' }),
          checkUpdate: async () => ({ success: true, data: available }),
          getUpdateState: async () => ({ success: true, data: IDLE_UPDATE_DOWNLOAD }),
          onUpdateState: (listener: (state: UpdateDownloadState) => void) => {
            push = listener
            return off
          }
        }
      }
    })
    const view = render(
      <UpdateCheckProvider>
        <Probe />
      </UpdateCheckProvider>
    )
    expect(await screen.findByText('idle')).toBeTruthy()

    act(() => push?.({ ...IDLE_UPDATE_DOWNLOAD, phase: 'downloading', percent: 10 }))
    expect(screen.getByTestId('phase').textContent).toBe('downloading')

    view.unmount()
    expect(off).toHaveBeenCalledTimes(1)
  })
})

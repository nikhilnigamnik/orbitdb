import {
  IconDownload,
  IconExternalLink,
  IconRefresh,
  IconRotateClockwise
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { formatBytes } from '@renderer/lib/format'
import type { UpdateCheckResult, UpdateDownloadState } from '@renderer/types'

interface UpdateActionsProps {
  result: UpdateCheckResult
  download: UpdateDownloadState
  onDownload: () => void
  onInstall: () => void
  onOpenRelease: (url: string) => void
}

/**
 * The right-hand side of the "version available" row. A build that can apply
 * the update itself gets Download, a progress bar, then Restart; one that
 * cannot - a `.deb`, or macOS until the bundle is signed - keeps the link to
 * the release page, since offering an install that fails at the end is worse
 * than a download the user does by hand.
 */
export function UpdateActions({
  result,
  download,
  onDownload,
  onInstall,
  onOpenRelease
}: UpdateActionsProps) {
  const releaseLink = result.releaseUrl ? (
    <Button
      size="sm"
      variant={result.installSupport === 'in-app' ? 'ghost' : 'outline'}
      className="shrink-0"
      onClick={() => onOpenRelease(result.releaseUrl!)}
    >
      <IconExternalLink size={14} />
      {result.installSupport === 'in-app' ? 'Release notes' : 'Open release page'}
    </Button>
  ) : null

  if (result.installSupport !== 'in-app') return releaseLink

  if (download.phase === 'downloading') {
    const percent = Math.max(0, Math.min(100, Math.round(download.percent)))
    return (
      <div className="flex w-56 shrink-0 flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Downloading{download.version ? ` v${download.version}` : ''}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Update download"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-active"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
        {download.totalBytes > 0 && (
          <span className="text-xs text-text-subtle tabular-nums">
            {formatBytes(download.transferredBytes)} of {formatBytes(download.totalBytes)}
          </span>
        )}
      </div>
    )
  }

  if (download.phase === 'downloaded') {
    return (
      <div className="flex shrink-0 items-center gap-2">
        {releaseLink}
        <Button size="sm" onClick={onInstall}>
          <IconRotateClockwise size={14} />
          Restart to install
        </Button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {releaseLink}
        <Button size="sm" onClick={onDownload}>
          {download.phase === 'error' ? <IconRefresh size={14} /> : <IconDownload size={14} />}
          {download.phase === 'error' ? 'Try again' : 'Download update'}
        </Button>
      </div>
      {download.phase === 'error' && download.error && (
        <span className="max-w-72 text-right text-xs text-danger-text">{download.error}</span>
      )}
    </div>
  )
}

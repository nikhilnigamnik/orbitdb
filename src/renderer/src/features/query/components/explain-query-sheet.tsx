import * as React from 'react'
import { IconAlertTriangle, IconSparkles } from '@tabler/icons-react'

import { Sheet } from '@renderer/components/ui/sheet'
import { Spinner } from '@renderer/components/ui/spinner'
import { LoadingState } from '@renderer/components/common/loading-state'
import { AiKeyRequired, isMissingAiKeyError } from '@renderer/components/common/ai-key-required'

import type { QueryExplanation } from '../hooks/use-query-ai'

// The markdown stack (about 150 KB) loads the first time someone asks.
const MarkdownView = React.lazy(async () => ({
  default: (await import('@renderer/components/common/markdown')).MarkdownView
}))

interface ExplainQuerySheetProps {
  explanation: QueryExplanation | null
  onClose: () => void
}

export function ExplainQuerySheet({ explanation, onClose }: ExplainQuerySheetProps) {
  const isLoading = explanation != null && explanation.text == null && explanation.error == null

  return (
    <Sheet
      title="Explain query"
      openSheet={explanation != null}
      setOpenSheet={(open) => !open && onClose()}
      side="right"
      sheetContentClassName="bg-surface"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 pr-12">
            <IconSparkles size={16} className="shrink-0 text-text-subtle" />
            <h2 className="truncate text-sm font-semibold text-text">Explain query</h2>
          </div>

          {/* The query being explained, so an answer is never read against an
              editor that has since changed. */}
          {explanation && (
            <pre className="max-h-40 shrink-0 overflow-auto border-b border-border bg-surface-sunken px-4 py-3 font-mono text-xs whitespace-pre-wrap text-text-muted">
              {explanation.sql.trim()}
            </pre>
          )}

          {isLoading ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-text-muted">
              <Spinner size={16} className="text-text-subtle" />
              <span className="text-xs">Reading the query…</span>
            </div>
          ) : isMissingAiKeyError(explanation?.error) ? (
            <AiKeyRequired onNavigate={onClose} />
          ) : explanation?.error ? (
            <div className="m-4 flex shrink-0 items-start gap-2 rounded-lg border border-danger/15 bg-danger/5 px-3 py-2.5 text-xs text-danger">
              <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span className="min-w-0 wrap-break-word">{explanation.error}</span>
            </div>
          ) : (
            <React.Suspense fallback={<LoadingState />}>
              <MarkdownView className="min-h-0 flex-1 overflow-auto p-4">
                {explanation?.text ?? ''}
              </MarkdownView>
            </React.Suspense>
          )}
        </div>
      }
    />
  )
}

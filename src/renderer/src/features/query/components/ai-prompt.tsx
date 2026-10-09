import * as React from 'react'
import { IconSparkles, IconX, IconArrowRight, IconArrowUpRight } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Dialog } from '@renderer/components/ui/dialog'
import { Kbd } from '@renderer/components/ui/kbd'
import { Chip } from '@renderer/components/ui/chip'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'

interface AiPromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `isRevision` is true when the request should edit the existing query. */
  onSubmit: (prompt: string, isRevision: boolean) => void
  isGenerating?: boolean
  placeholder?: string
  suggestions?: string[]
  /**
   * Offers to edit an existing query rather than write a new one - the SQL
   * editor passes this when it holds one. Editing is the default then, since a
   * follow-up ("only last week") is the commoner request once a query exists.
   */
  canRevise?: boolean
}

const REVISION_SUGGESTIONS = [
  'Only include rows from the last 30 days',
  'Sort the newest first',
  'Also show the total count'
]

const DEFAULT_SUGGESTIONS = [
  'Top 10 customers by revenue this month',
  'Users who signed up but never logged in',
  'Count orders grouped by status'
]

/**
 * Floating natural-language → SQL prompt, built on the Dialog primitive.
 * Reused for SQL generation (query page) and table filtering (data view) -
 * `placeholder`/`suggestions` let each surface tailor the copy.
 */
export function AiPrompt({
  open,
  onOpenChange,
  onSubmit,
  isGenerating = false,
  placeholder = 'Describe the query you want…',
  suggestions = DEFAULT_SUGGESTIONS,
  canRevise = false
}: AiPromptProps) {
  const [prompt, setPrompt] = React.useState('')
  const [wantsNewQuery, setWantsNewQuery] = React.useState(false)
  const isRevision = canRevise && !wantsNewQuery

  // Each opening starts from the default for what the editor holds now.
  React.useEffect(() => {
    if (open) setWantsNewQuery(false)
  }, [open])

  function close() {
    onOpenChange(false)
  }

  function submit(value: string = prompt) {
    const trimmed = value.trim()
    if (!trimmed || isGenerating) return
    onSubmit(trimmed, isRevision)
    setPrompt('')
  }

  return (
    <Dialog
      open={open}
      setOpen={onOpenChange}
      title={isRevision ? 'Ask AI to edit the query' : 'Ask AI to write SQL'}
      description={
        isRevision
          ? 'Describe the change in plain words. The revised query replaces the one in the editor, for review.'
          : 'Describe the query in plain words. The SQL lands in the editor for review.'
      }
      content={
        <>
          <div className="flex h-12 items-center gap-2.5 border-b border-border px-4">
            {isGenerating ? (
              <Spinner size={16} className="text-accent-text" />
            ) : (
              <IconSparkles size={16} className="shrink-0 text-accent-text" />
            )}
            <input
              autoFocus
              value={prompt}
              disabled={isGenerating}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={
                isGenerating
                  ? 'Generating…'
                  : isRevision
                    ? 'Describe the change to make…'
                    : placeholder
              }
              className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-text-subtle focus:outline-none disabled:opacity-60"
            />
            <Chip tone="accent">Beta</Chip>
            <Button
              size="icon-xs"
              variant="subtle"
              className="shrink-0"
              onClick={close}
              aria-label="Close AI prompt"
            >
              <IconX size={14} />
            </Button>
          </div>

          {canRevise && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <SlidingTabs
                value={isRevision ? 'edit' : 'new'}
                onChange={(value) => setWantsNewQuery(value === 'new')}
                tabs={[
                  { id: 'edit', label: 'Edit current query' },
                  { id: 'new', label: 'New query' }
                ]}
              />
            </div>
          )}

          <div className="flex flex-col p-1.5">
            <p className="flex h-7 items-center px-2 text-[12px] font-medium text-text-subtle">
              Try
            </p>
            {(isRevision ? REVISION_SUGGESTIONS : suggestions).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="group/sug flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-text transition-colors hover:bg-surface-elevated"
              >
                <IconSparkles
                  size={16}
                  className="shrink-0 text-text-subtle transition-colors group-hover/sug:text-accent-text"
                />
                <span className="truncate">{s}</span>
                <IconArrowUpRight
                  size={14}
                  className="ml-auto shrink-0 text-text-subtle opacity-0 transition-opacity group-hover/sug:opacity-100"
                />
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="flex items-center gap-1.5 text-[12px] text-text-subtle">
              <Kbd>↵</Kbd>
              <span>Generate</span>
              <span className="text-text-subtle/40">·</span>
              <Kbd>Esc</Kbd>
              <span>Dismiss</span>
            </span>
            <Button size="sm" onClick={() => submit()} disabled={!prompt.trim() || isGenerating}>
              {isGenerating ? (
                <Spinner size={14} className="text-current" />
              ) : (
                <IconArrowRight size={14} />
              )}
              {isGenerating ? 'Generating…' : isRevision ? 'Update query' : 'Generate'}
            </Button>
          </div>
        </>
      }
    />
  )
}

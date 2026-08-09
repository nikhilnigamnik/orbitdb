import * as React from 'react'
import { IconSparkles, IconX, IconArrowRight, IconArrowUpRight } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Dialog } from '@renderer/components/ui/dialog'
import { Kbd } from '@renderer/components/ui/kbd'

interface AiPromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (prompt: string) => void
  isGenerating?: boolean
  placeholder?: string
  suggestions?: string[]
}

const DEFAULT_SUGGESTIONS = [
  'Top 10 customers by revenue this month',
  'Users who signed up but never logged in',
  'Count orders grouped by status'
]

/**
 * Floating natural-language → SQL prompt, built on the Dialog primitive.
 * Reused for SQL generation (query page) and table filtering (data view) —
 * `placeholder`/`suggestions` let each surface tailor the copy.
 */
export function AiPrompt({
  open,
  onOpenChange,
  onSubmit,
  isGenerating = false,
  placeholder = 'Describe the query you want…',
  suggestions = DEFAULT_SUGGESTIONS
}: AiPromptProps) {
  const [prompt, setPrompt] = React.useState('')

  function close() {
    onOpenChange(false)
  }

  function submit(value: string = prompt) {
    const trimmed = value.trim()
    if (!trimmed || isGenerating) return
    onSubmit(trimmed)
    setPrompt('')
  }

  return (
    <Dialog
      open={open}
      setOpen={onOpenChange}
      content={
        <>
          <div className="absolute inset-x-0 top-0 h-px bg-accent/40" />

          <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
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
              placeholder={isGenerating ? 'Generating…' : placeholder}
              className="min-w-0 flex-1 bg-transparent text-xs text-text placeholder:text-text-subtle focus:outline-none disabled:opacity-60"
            />
            <span className="shrink-0 rounded bg-surface-elevated px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-text-subtle">
              Beta
            </span>
            <Button
              size="icon-xs"
              variant="ghost"
              className="shrink-0 text-text-subtle hover:bg-surface-elevated hover:text-text"
              onClick={close}
              aria-label="Close AI prompt"
            >
              <IconX size={13} />
            </Button>
          </div>

          <div className="flex flex-col gap-1 p-2">
            <p className="px-1.5 pb-1 text-xs font-semibold uppercase tracking-wider text-text-subtle">
              Try
            </p>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="group/sug flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <IconSparkles
                  size={12}
                  className="shrink-0 text-text-subtle transition-colors group-hover/sug:text-accent-text"
                />
                <span className="truncate">{s}</span>
                <IconArrowUpRight
                  size={13}
                  className="ml-auto shrink-0 text-text-subtle opacity-0 transition-opacity group-hover/sug:opacity-100"
                />
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-elevated/30 px-3.5 py-2">
            <span className="flex items-center gap-1.5 text-xs text-text-subtle">
              <Kbd>↵</Kbd>
              <span>Generate</span>
              <span className="text-text-subtle/40">·</span>
              <Kbd>Esc</Kbd>
              <span>Dismiss</span>
            </span>
            <Button size="sm" onClick={() => submit()} disabled={!prompt.trim() || isGenerating}>
              {isGenerating ? (
                <Spinner size={12} className="text-current" />
              ) : (
                <IconArrowRight size={12} />
              )}
              {isGenerating ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </>
      }
    />
  )
}

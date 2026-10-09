import * as React from 'react'
import { IconKeyboard } from '@tabler/icons-react'
import { Dialog, DialogDescription, DialogTitle } from '@renderer/components/ui/dialog'
import { Kbd } from '@renderer/components/ui/kbd'
import { SHORTCUT_GROUPS, shortcutParts } from '@renderer/config/shortcuts'
import { isTyping } from '@renderer/lib/keyboard'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Every shortcut in one list, on `?`.
 *
 * Mounted once at the app root. The keys it documents are defined in
 * `config/shortcuts.ts` and implemented elsewhere, which is the usual way a
 * help screen goes stale - so the list is data, read by both.
 */
export function ShortcutsOverlay() {
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      e.preventDefault()
      setIsOpen((open) => !open)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <Dialog
      open={isOpen}
      setOpen={setIsOpen}
      className="top-[10vh] w-[min(720px,calc(100vw-2rem))]"
      content={
        <div className="flex max-h-[76vh] flex-col">
          <div className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-text-muted">
              <IconKeyboard size={16} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-px">
              <DialogTitle className="text-[15px] leading-tight font-semibold text-text">
                Keyboard shortcuts
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 text-xs text-text-muted">
                Press <Kbd>?</Kbd> any time
              </DialogDescription>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-6 gap-y-4 overflow-auto px-5 pt-1 pb-5 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.title} className="break-inside-avoid">
                <h3 className="mb-1 text-[12px] font-medium text-text-subtle">{group.title}</h3>
                <dl className="flex flex-col">
                  {group.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.keys}
                      className="flex h-8 items-center justify-between gap-3 border-b border-border last:border-b-0"
                    >
                      <dt className="min-w-0 flex-1 truncate text-xs text-text">
                        {shortcut.description}
                      </dt>
                      <dd className="flex shrink-0 items-center gap-0.5">
                        {shortcutParts(shortcut.keys, isMac).map((part, i) => (
                          <Kbd key={i}>{part}</Kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      }
    />
  )
}

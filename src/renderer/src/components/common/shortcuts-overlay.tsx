import * as React from 'react'
import { IconKeyboard } from '@tabler/icons-react'
import { Dialog } from '@renderer/components/ui/dialog'
import { Kbd } from '@renderer/components/ui/kbd'
import { SHORTCUT_GROUPS, shortcutParts } from '@renderer/config/shortcuts'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** True when a keystroke belongs to whatever the user is typing into. */
function isTyping(target: EventTarget | null): boolean {
  // An instanceof check rather than a cast: a keydown can be dispatched at the
  // document, which has neither `tagName` nor `closest`.
  if (!(target instanceof HTMLElement)) return false
  const element = target
  const tag = element.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    element.isContentEditable ||
    // The SQL editor is a contenteditable inside this class rather than a
    // textarea, and `?` is a character someone may well be typing.
    element.closest('.cm-editor') != null
  )
}

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
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
            <IconKeyboard size={14} className="text-text-subtle" />
            <h2 className="text-xs font-semibold text-text">Keyboard shortcuts</h2>
            <span className="ml-auto text-xs text-text-subtle">
              Press <Kbd>?</Kbd> any time
            </span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-6 overflow-auto p-4 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.title} className="mb-4 break-inside-avoid">
                <h3 className="mb-1.5 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
                  {group.title}
                </h3>
                <dl className="flex flex-col">
                  {group.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.keys}
                      className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0"
                    >
                      <dt className="min-w-0 flex-1 truncate text-xs text-text-muted">
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

import * as React from 'react'
import {
  IconBookmark,
  IconCheck,
  IconDeviceFloppy,
  IconPencil,
  IconTrash
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Popover } from '@renderer/components/ui/popover'
import { Spinner } from '@renderer/components/ui/spinner'
import { cn } from '@renderer/lib/utils'
import type { SavedTableView } from '@renderer/types'

interface SavedViewsMenuProps {
  views: SavedTableView[]
  /** The view currently applied, if the screen was last set up from one. */
  activeView: SavedTableView | null
  /** Whether the screen has drifted from the applied view. */
  isDirty: boolean
  isBusy?: boolean
  onApply: (view: SavedTableView) => void
  /** Saves whatever is on screen under this name, replacing a view of that name. */
  onSave: (name: string) => void
  onOverwrite: (view: SavedTableView) => void
  onRename: (view: SavedTableView, name: string) => void
  onDelete: (view: SavedTableView) => void
}

export function SavedViewsMenu({
  views,
  activeView,
  isDirty,
  isBusy = false,
  onApply,
  onSave,
  onOverwrite,
  onRename,
  onDelete
}: SavedViewsMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [draftName, setDraftName] = React.useState('')
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [renameDraft, setRenameDraft] = React.useState('')

  // Reopening starts from a clean slate rather than from whatever half-typed
  // name was abandoned last time.
  React.useEffect(() => {
    if (!isOpen) {
      setDraftName('')
      setRenamingId(null)
    }
  }, [isOpen])

  const trimmed = draftName.trim()
  const clash = views.find((v) => v.name.toLowerCase() === trimmed.toLowerCase())

  function submitSave() {
    if (!trimmed) return
    onSave(trimmed)
    setDraftName('')
    setIsOpen(false)
  }

  function submitRename(view: SavedTableView) {
    const name = renameDraft.trim()
    setRenamingId(null)
    if (!name || name === view.name) return
    onRename(view, name)
  }

  return (
    <Popover
      openPopover={isOpen}
      setOpenPopover={setIsOpen}
      align="start"
      popoverContentClassName="w-72 overflow-hidden"
      content={
        <div className="flex flex-col">
          <div className="flex max-h-64 flex-col overflow-auto p-1">
            {views.length === 0 ? (
              <p className="px-2 py-3 text-xs text-text-subtle">
                No saved views yet. Set up the filters and columns you want, then name them below.
              </p>
            ) : (
              views.map((view) => {
                const isActive = view.id === activeView?.id
                if (view.id === renamingId) {
                  return (
                    <form
                      key={view.id}
                      className="p-1"
                      onSubmit={(e) => {
                        e.preventDefault()
                        submitRename(view)
                      }}
                    >
                      <Input
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => submitRename(view)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        aria-label={`Rename ${view.name}`}
                        autoFocus
                      />
                    </form>
                  )
                }
                return (
                  // Sibling buttons, not one row with nested controls: a menu
                  // item owns its whole row's activation, so a pencil inside one
                  // would apply the view as well as rename it.
                  <div
                    key={view.id}
                    className="group/view flex items-center gap-0.5 rounded-md pr-1 hover:bg-surface-elevated"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onApply(view)
                        setIsOpen(false)
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left"
                    >
                      <IconBookmark
                        size={12}
                        className={cn(
                          'shrink-0',
                          isActive ? 'text-accent-text' : 'text-text-subtle'
                        )}
                      />
                      <span
                        className={cn(
                          'truncate text-xs',
                          isActive ? 'text-text' : 'text-text-muted'
                        )}
                      >
                        {view.name}
                      </span>
                      {isActive && !isDirty && (
                        <IconCheck size={12} className="ml-auto shrink-0 text-accent-text" />
                      )}
                    </button>
                    {isActive && isDirty && (
                      <button
                        type="button"
                        onClick={() => onOverwrite(view)}
                        aria-label={`Update ${view.name} to the current view`}
                        title="Update to the current view"
                        className="shrink-0 cursor-pointer rounded p-1 text-text-subtle transition-colors hover:bg-surface hover:text-text"
                      >
                        <IconDeviceFloppy size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(view.id)
                        setRenameDraft(view.name)
                      }}
                      aria-label={`Rename ${view.name}`}
                      className="shrink-0 cursor-pointer rounded p-1 text-text-subtle opacity-0 transition-colors group-hover/view:opacity-100 hover:bg-surface hover:text-text"
                    >
                      <IconPencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(view)}
                      aria-label={`Delete ${view.name}`}
                      className="shrink-0 cursor-pointer rounded p-1 text-text-subtle opacity-0 transition-colors group-hover/view:opacity-100 hover:bg-danger/10 hover:text-danger"
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <form
            className="flex flex-col gap-1.5 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault()
              submitSave()
            }}
          >
            <div className="flex items-center gap-1.5">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Name this view"
                aria-label="Name this view"
              />
              <Button type="submit" size="sm" disabled={!trimmed || isBusy}>
                {isBusy ? <Spinner size={12} /> : 'Save'}
              </Button>
            </div>
            {clash && (
              <p className="text-xs text-text-subtle">
                Replaces the existing &ldquo;{clash.name}&rdquo;.
              </p>
            )}
          </form>
        </div>
      }
    >
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          'shrink-0 text-text-muted hover:bg-surface-elevated hover:text-text',
          activeView && 'text-text'
        )}
        title="Saved views"
      >
        <IconBookmark size={12} />
        <span className="max-w-32 truncate">{activeView ? activeView.name : 'Views'}</span>
        {activeView && isDirty && (
          // The word, not a dot: a dot beside a view name reads as a status
          // light, and this is the difference between what is on screen and what
          // the view would restore.
          <span className="text-text-subtle">modified</span>
        )}
        {!activeView && views.length > 0 && (
          <span className="text-text-subtle">{views.length}</span>
        )}
      </Button>
    </Popover>
  )
}

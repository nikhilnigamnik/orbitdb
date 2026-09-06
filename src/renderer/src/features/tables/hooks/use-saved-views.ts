import * as React from 'react'
import { useToast } from '@renderer/components/ui/toast'
import { errorMessage } from '@renderer/lib/errors'
import { unwrap } from '@renderer/lib/ipc'
import { isSameView, upsertView } from '@renderer/features/tables/lib/saved-views'
import type { SavedTableView, TableViewScope, TableViewState } from '@renderer/types'

interface SavedViewsApi {
  views: SavedTableView[]
  /** The view the screen was last set up from, if any. */
  activeView: SavedTableView | null
  /** Whether the screen has drifted from `activeView`. False when none is applied. */
  isDirty: boolean
  isSaving: boolean
  /** Marks a view as the one on screen. Applying it is the caller's job. */
  markApplied: (id: string | null) => void
  save: (name: string) => Promise<void>
  patch: (view: SavedTableView, patch: { name?: string; useCurrent?: boolean }) => Promise<void>
  remove: (view: SavedTableView) => Promise<void>
}

/**
 * Owns one table's saved views: the list, which one is applied, and the four
 * calls that change them.
 *
 * Applying a view is deliberately *not* here. It writes filters, sort, page size
 * and the stored preferences all at once, and threading half a dozen setters
 * through a hook would only move the code without moving the coupling.
 */
export function useSavedViews(scope: TableViewScope, currentView: TableViewState): SavedViewsApi {
  const toast = useToast()
  const [views, setViews] = React.useState<SavedTableView[]>([])
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)

  const { connectionId, schema, table } = scope

  React.useEffect(() => {
    let cancelled = false
    // A different table has a different set, and none of it is applied yet. The
    // list is emptied rather than left to be replaced when the call lands:
    // applying a view writes filters, sort and prefs straight onto whatever
    // table is on screen, so another scope's entries must never be clickable -
    // not during the round trip, and not for good if the call fails.
    setActiveViewId(null)
    setViews([])
    void unwrap(window.api.views.list({ connectionId, schema, table }))
      .then((saved) => {
        if (!cancelled) setViews(saved)
      })
      .catch(() => {
        // Saved views sit on top of a table that already works - failing to list
        // them must not put an error over the rows.
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, schema, table])

  const activeView = views.find((v) => v.id === activeViewId) ?? null
  const isDirty = activeView ? !isSameView(activeView.view, currentView) : false

  const save = React.useCallback(
    async (name: string) => {
      setIsSaving(true)
      try {
        const saved = await unwrap(
          window.api.views.save({ connectionId, schema, table, name, view: currentView })
        )
        setViews((prev) => upsertView(prev, saved))
        setActiveViewId(saved.id)
        toast.success(`Saved view "${saved.name}"`)
      } catch (err) {
        toast.error('Could not save the view', { description: errorMessage(err) })
      } finally {
        setIsSaving(false)
      }
    },
    [connectionId, schema, table, currentView, toast]
  )

  const patch = React.useCallback(
    async (view: SavedTableView, changes: { name?: string; useCurrent?: boolean }) => {
      try {
        const saved = await unwrap(
          window.api.views.update(view.id, {
            ...(changes.name !== undefined ? { name: changes.name } : {}),
            ...(changes.useCurrent ? { view: currentView } : {})
          })
        )
        setViews((prev) => upsertView(prev, saved))
      } catch (err) {
        toast.error('Could not update the view', { description: errorMessage(err) })
      }
    },
    [currentView, toast]
  )

  const remove = React.useCallback(
    async (view: SavedTableView) => {
      try {
        await unwrap(window.api.views.delete(view.id))
        setViews((prev) => prev.filter((v) => v.id !== view.id))
        // What is on screen stays as it is - deleting the bookmark is not a
        // reason to throw away the rows the user is looking at.
        setActiveViewId((current) => (current === view.id ? null : current))
      } catch (err) {
        toast.error('Could not delete the view', { description: errorMessage(err) })
      }
    },
    [toast]
  )

  return { views, activeView, isDirty, isSaving, markApplied: setActiveViewId, save, patch, remove }
}

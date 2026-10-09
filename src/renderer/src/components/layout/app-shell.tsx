import * as React from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { ROUTES } from '@renderer/config/routes'
import { CommandPalette } from '@renderer/features/command-palette/components/command-palette'
import { useCommandPalette } from '@renderer/features/command-palette/store'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { ValueSearchDialog } from '@renderer/features/database/components/value-search-dialog'
import { onValueSearchRequested } from '@renderer/features/database/lib/schema-events'
import { hasOpenOverlay, isTyping } from '@renderer/lib/keyboard'

import { Sidebar } from './sidebar'

/**
 * Attio's frame: one light sidebar on the left and a white canvas filling the
 * rest, split by a single hairline. Every route renders inside it - including
 * Connections, so Settings and the switcher are always one click away.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const { active } = useConnection()
  const { isOpen, setOpen, toggle } = useCommandPalette()
  const [isValueSearchOpen, setIsValueSearchOpen] = React.useState(false)
  const schema = pathname.startsWith(ROUTES.database) ? (searchParams.get('schema') ?? '') : ''
  const isSettings = pathname.startsWith(ROUTES.settings)

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
        return
      }
      // Mod+Shift+F rather than Mod+F: plain Mod+F is the filter people expect
      // inside the current table, and a whole-database sweep is not that.
      if (isMod && e.shiftKey && e.key.toLowerCase() === 'f' && active) {
        e.preventDefault()
        setIsValueSearchOpen(true)
        return
      }
      // The sidebar's search button advertises "/". A bare character, so it
      // yields to anything being typed into and to an open dialog or menu.
      if (
        e.key === '/' &&
        !isMod &&
        !e.altKey &&
        !e.defaultPrevented &&
        active &&
        !isTyping(e.target) &&
        !hasOpenOverlay()
      ) {
        e.preventDefault()
        setIsValueSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggle, active])

  React.useEffect(() => onValueSearchRequested(() => setIsValueSearchOpen(true)), [])

  return (
    <div className="relative flex h-screen bg-surface">
      {/* Settings takes over the window with its own sidebar, as in Attio. */}
      {!isSettings && <Sidebar />}
      {/* Every page fills the canvas whatever its own root says - a page whose
          root forgot flex-1 used to stop short of the window's right edge. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface *:min-h-0 *:flex-1">
        {children}
      </div>
      <CommandPalette open={isOpen} onOpenChange={setOpen} />
      {/* Keyed by connection: its term and hits belong to the database they
          were found in, and an old hit would open the wrong table. */}
      {active && (
        <ValueSearchDialog
          key={active.connectionId}
          isOpen={isValueSearchOpen}
          onClose={() => setIsValueSearchOpen(false)}
          connectionId={active.connectionId}
          schema={schema}
        />
      )}
    </div>
  )
}

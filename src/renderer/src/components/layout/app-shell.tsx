import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { ROUTES } from '@renderer/config/routes'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const isHome = pathname === ROUTES.connections

  return (
    <div className="relative flex h-screen bg-bg">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-50 h-10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      {isHome ? (
        <main className="flex-1 overflow-auto">{children}</main>
      ) : (
        <>
          <Sidebar />
          <main className="my-2 mr-2 flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg shadow-black/20">
            {children}
          </main>
        </>
      )}
    </div>
  )
}

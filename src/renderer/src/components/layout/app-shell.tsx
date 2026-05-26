import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { ROUTES } from '@renderer/config/routes'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const isHome = pathname === ROUTES.connections
  const isSplit = pathname.startsWith(ROUTES.database)

  return (
    <div className="relative flex h-screen bg-bg">
      {isHome ? (
        <main className="flex-1 overflow-auto">{children}</main>
      ) : isSplit ? (
        <>
          <Sidebar />
          <div className="my-1 mr-1 flex flex-1 min-w-0 gap-1">{children}</div>
        </>
      ) : (
        <>
          <Sidebar />
          <main className="my-1 mr-1 flex-1 overflow-hidden rounded-xl bg-surface shadow-lg shadow-black/20">
            {children}
          </main>
        </>
      )}
    </div>
  )
}

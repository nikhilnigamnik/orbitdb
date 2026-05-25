import * as React from 'react'
import { Sidebar } from './sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-screen bg-[var(--color-bg)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-50 h-10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}

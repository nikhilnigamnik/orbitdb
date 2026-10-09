import * as React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

import { AppShell } from '@renderer/components/layout/app-shell'
import { ErrorBoundary } from '@renderer/components/common/error-boundary'
import { LoadingState } from '@renderer/components/common/loading-state'
import { ShortcutsOverlay } from '@renderer/components/common/shortcuts-overlay'
import { ToastProvider } from '@renderer/components/ui/toast'
import { ConnectionProvider } from '@renderer/features/connections/store/connection-store'
import { CommandPaletteProvider } from '@renderer/features/command-palette/store'
import { UpdateCheckProvider } from '@renderer/features/settings/store'
import { ThemeProvider } from '@renderer/features/settings/theme'
import { ConnectionsPage } from '@renderer/features/connections/components/connections-page'
import { DatabasePage } from '@renderer/features/database/components/database-page'
import { ROUTES } from '@renderer/config/routes'

// Split off the first paint: CodeMirror rides with the query page and xyflow
// with the diagram, and neither is needed until someone opens it.
const DiagramPage = React.lazy(async () => ({
  default: (await import('@renderer/features/diagram/components/diagram-page')).DiagramPage
}))
const QueryPage = React.lazy(async () => ({
  default: (await import('@renderer/features/query/components/query-page')).QueryPage
}))
const LogsPage = React.lazy(async () => ({
  default: (await import('@renderer/features/logs/components/logs-page')).LogsPage
}))
const SettingsPage = React.lazy(async () => ({
  default: (await import('@renderer/features/settings/components/settings-page')).SettingsPage
}))

function AppRoutes() {
  const location = useLocation()
  return (
    <ErrorBoundary resetKey={location.key}>
      <React.Suspense fallback={<LoadingState />}>
        <Routes>
          <Route path={ROUTES.connections} element={<ConnectionsPage />} />
          <Route path={ROUTES.database} element={<DatabasePage />} />
          <Route path={ROUTES.table} element={<DatabasePage />} />
          <Route path={ROUTES.diagram} element={<DiagramPage />} />
          <Route path={ROUTES.query} element={<QueryPage />} />
          <Route path={ROUTES.logs} element={<LogsPage />} />
          <Route path={ROUTES.settings} element={<SettingsPage />} />
          <Route path="*" element={<Navigate to={ROUTES.connections} replace />} />
        </Routes>
      </React.Suspense>
    </ErrorBoundary>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConnectionProvider>
          <UpdateCheckProvider>
            <CommandPaletteProvider>
              <AppShell>
                <AppRoutes />
              </AppShell>
              <ShortcutsOverlay />
            </CommandPaletteProvider>
          </UpdateCheckProvider>
        </ConnectionProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

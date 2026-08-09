import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@renderer/components/layout/app-shell'
import { ToastProvider } from '@renderer/components/ui/toast'
import { ConnectionProvider } from '@renderer/features/connections/store/connection-store'
import { CommandPaletteProvider } from '@renderer/features/command-palette/store'
import { UpdateCheckProvider } from '@renderer/features/settings/store'
import { ConnectionsPage } from '@renderer/features/connections/components/connections-page'
import { DatabasePage } from '@renderer/features/database/components/database-page'
import { DiagramPage } from '@renderer/features/diagram/components/diagram-page'
import { QueryPage } from '@renderer/features/query/components/query-page'
import { LogsPage } from '@renderer/features/logs/components/logs-page'
import { SettingsPage } from '@renderer/features/settings/components/settings-page'
import { ROUTES } from '@renderer/config/routes'

function App() {
  return (
    <ToastProvider>
      <ConnectionProvider>
        <UpdateCheckProvider>
          <CommandPaletteProvider>
            <AppShell>
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
            </AppShell>
          </CommandPaletteProvider>
        </UpdateCheckProvider>
      </ConnectionProvider>
    </ToastProvider>
  )
}

export default App

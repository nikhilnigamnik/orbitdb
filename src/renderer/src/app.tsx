import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@renderer/components/layout/app-shell'
import { ConnectionProvider } from '@renderer/features/connections/store/connection-store'
import { ConnectionsPage } from '@renderer/features/connections/components/connections-page'
import { DatabasePage } from '@renderer/features/database/components/database-page'
import { QueryPage } from '@renderer/features/query/components/query-page'
import { ROUTES } from '@renderer/config/routes'

function App() {
  return (
    <ConnectionProvider>
      <AppShell>
        <Routes>
          <Route path={ROUTES.connections} element={<ConnectionsPage />} />
          <Route path={ROUTES.database} element={<DatabasePage />} />
          <Route path={ROUTES.table} element={<DatabasePage />} />
          <Route path={ROUTES.query} element={<QueryPage />} />
          <Route path="*" element={<Navigate to={ROUTES.connections} replace />} />
        </Routes>
      </AppShell>
    </ConnectionProvider>
  )
}

export default App

import '@fontsource-variable/inter'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import './assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import { ErrorBoundary } from '@renderer/components/common/error-boundary'

import { App } from './app'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HashRouter>
  </StrictMode>
)

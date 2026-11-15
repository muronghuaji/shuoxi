import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ContextMenuProvider } from './components/ContextMenuProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { WindowTitlebar } from './components/WindowTitlebar'
import { installGlobalDiagnostics } from './diagnostics'
import './styles.css'

installGlobalDiagnostics()

if (navigator.userAgent.includes('Electron')) {
  document.documentElement.dataset.runtime = 'electron'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ContextMenuProvider>
        <WindowTitlebar />
        <App />
      </ContextMenuProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

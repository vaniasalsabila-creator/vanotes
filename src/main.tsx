import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import './index.css'
import { migrateDumpName } from './lib/quick'
import { migrateMeetingDividers } from './lib/calendar'

// Ask the browser not to evict our IndexedDB under storage pressure.
navigator.storage?.persist?.()

void migrateDumpName()
void migrateMeetingDividers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AuthProvider>
  </StrictMode>,
)

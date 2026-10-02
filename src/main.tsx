import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { migrateDumpName } from './lib/quick'

// Ask the browser not to evict our IndexedDB under storage pressure.
navigator.storage?.persist?.()

void migrateDumpName()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

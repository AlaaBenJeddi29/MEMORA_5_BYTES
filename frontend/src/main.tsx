import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { initAccessibilityPreferences } from './utils/accessibilityPreferences'
import './styles/global.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root was not found in index.html')
}

// Applied before the first render so a saved dark theme or text size is already
// on screen — no white flash after a refresh.
initAccessibilityPreferences()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

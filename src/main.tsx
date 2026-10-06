import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, loadAppearance } from './ui/appearance'

// Before the first paint, so a dark theme doesn't flash in light.
applyTheme(loadAppearance().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

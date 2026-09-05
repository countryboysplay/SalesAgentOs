import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { applyStoredThemeEarly } from './app/ThemeProvider'
import './styles/global.css'

// Paint the right theme before React's first render, so a dark-mode launch
// never flashes white (§45).
applyStoredThemeEarly()

const container = document.getElementById('root')
if (!container) throw new Error('SalesTrack could not find its root element.')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/*
 * Service worker. The ONLY thing it caches is the app shell, so the app opens
 * with no network at all (§37, §60). It never touches sales data — that lives
 * in IndexedDB and is never transmitted anywhere (§2).
 *
 * `autoUpdate` means a new build installs silently and takes effect on the
 * next launch. There is deliberately no "update available" prompt: the agent
 * has nothing to decide, and an update banner would read as a network feature.
 */
registerSW({ immediate: true })

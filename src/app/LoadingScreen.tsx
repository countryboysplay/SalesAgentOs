import { BrandMark } from '@/components'
import './LoadingScreen.css'

/** The SalesAgentOS mark, shared by the loading screen and the desktop rail. */
export function AppMark({ size = 68 }: { size?: number }) {
  return <BrandMark size={size} className="loading__mark" />
}

/**
 * LoadingScreen — spec §61.
 *
 * Copy is fixed and must not change: no "Connecting…", no "Syncing…", no
 * "Fetching account…", no progress bar. The app has nothing to connect to,
 * and saying otherwise would be a lie about where the data lives (§62).
 */
export function LoadingScreen() {
  return (
    <div className="loading" role="status" aria-live="polite">
      <AppMark />
      <h1 className="loading__name">SalesAgentOS</h1>
      <p className="loading__tagline">Your personal sales ledger</p>
    </div>
  )
}

export default LoadingScreen

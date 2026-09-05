import './LoadingScreen.css'

/** The SalesTrack mark, shared by the loading screen and the desktop rail. */
export function AppMark({ size = 68 }: { size?: number }) {
  return (
    <svg
      className="loading__mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="SalesTrack"
    >
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <rect x="14" y="34" width="8" height="16" rx="3" fill="#fff" opacity="0.55" />
      <rect x="28" y="26" width="8" height="24" rx="3" fill="#fff" opacity="0.78" />
      <rect x="42" y="14" width="8" height="36" rx="3" fill="#fff" />
    </svg>
  )
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
      <h1 className="loading__name">SalesTrack</h1>
      <p className="loading__tagline">Your personal sales ledger</p>
    </div>
  )
}

export default LoadingScreen

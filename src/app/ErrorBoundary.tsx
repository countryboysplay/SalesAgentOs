import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components'
import { AppMark } from './LoadingScreen'
import './LoadingScreen.css'

interface Props {
  children: ReactNode
  /** Optional custom fallback. Must never imply the data is gone. */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

/**
 * ErrorBoundary — the calm recovery screen.
 *
 * Copy rules, in order of importance:
 *   1. Never suggest the sales history is lost. It is in IndexedDB, and a
 *      render crash does not touch it. The first line the agent reads must
 *      say so.
 *   2. Never mention servers, connections or accounts (§62).
 *   3. Offer the smallest possible next step — reload — before anything else.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No analytics, no network. The console is the only reporting channel
    // this product is allowed to have (§2).
    console.error('[SalesTrack] render error', error, info.componentStack)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="loading" role="alert">
        <AppMark />
        <h1 className="loading__name">Something went wrong</h1>
        <p className="loading__tagline">
          Your sales are safe. Everything is still stored on this device.
        </p>

        <div className="loading__actions">
          <Button variant="primary" size="lg" onClick={this.reload}>
            Reload SalesTrack
          </Button>
          <Button variant="ghost" onClick={this.reset}>
            Try this screen again
          </Button>
        </div>

        <p className="loading__detail">
          This screen failed to draw. Nothing was deleted and nothing was changed. If it keeps
          happening, create a backup from Settings so you have a copy of your history.
        </p>

        <pre className="loading__code">{error.message}</pre>
      </div>
    )
  }
}

export default ErrorBoundary

import { useEffect } from 'react'
import { ToastProvider } from '@/components'
import { AppShell } from '@/app/AppShell'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { LoadingScreen } from '@/app/LoadingScreen'
import { ThemeProvider } from '@/app/ThemeProvider'
import { PersistErrorBanner } from '@/app/PersistErrorBanner'
import { RouterProvider, ROUTES, useRouter } from '@/app/router'
import { StoreProvider, useStoreStatus } from '@/app/store'

import HomeScreen from '@/screens/home/HomeScreen'
import SalesScreen from '@/screens/sales/SalesScreen'
import InsightsScreen from '@/screens/insights/InsightsScreen'
import SettingsScreen from '@/screens/settings/SettingsScreen'
import OnboardingFlow from '@/screens/onboarding/OnboardingFlow'
import AddSaleSheet from '@/screens/home/AddSaleSheet'


/** Maps the current route to a screen. The route table is small enough to read. */
function Routes() {
  const { path, segments } = useRouter()

  if (path === ROUTES.home) return <HomeScreen />
  if (segments[0] === 'sales') return <SalesScreen />
  if (segments[0] === 'insights') return <InsightsScreen />
  // Settings owns everything under /settings/* and reads the sub-route itself
  // via useSubRoute('/settings').
  if (segments[0] === 'settings') return <SettingsScreen />

  return <HomeScreen />
}

/**
 * Decides what the agent sees: the loading screen while IndexedDB opens, the
 * onboarding flow on a fresh install (§7), or the app.
 */
function AppRoot() {
  const { status, hydrateError, needsOnboarding } = useStoreStatus()
  const { path, navigate } = useRouter()

  // Onboarding is a gate, not a route the agent can wander away from.
  useEffect(() => {
    if (status !== 'ready') return
    if (needsOnboarding && path !== ROUTES.onboarding) {
      navigate(ROUTES.onboarding, { replace: true })
    } else if (!needsOnboarding && path === ROUTES.onboarding) {
      navigate(ROUTES.home, { replace: true })
    }
  }, [status, needsOnboarding, path, navigate])

  if (status === 'loading') return <LoadingScreen />

  // A failed hydrate is not a lost ledger — say so, and let them retry.
  if (status === 'error') {
    throw hydrateError ?? new Error('SalesTrack could not open its local storage.')
  }

  if (needsOnboarding) {
    return (
      <AppShell chromeless>
        <PersistErrorBanner />
        <OnboardingFlow />
      </AppShell>
    )
  }

  // The sheet is mounted once here, not inside HomeScreen: the + Sale button
  // lives in the shell and must work from every tab (§6).
  return (
    <AppShell overlays={<AddSaleSheet />}>
      <PersistErrorBanner />
      <Routes />
    </AppShell>
  )
}

/**
 * Provider order matters:
 *   ErrorBoundary  — catches everything below, including a hydrate failure
 *   ThemeProvider  — owns <html data-theme>; must be outside the store, which
 *                    calls useTheme() to apply Settings.theme after hydrate
 *   ToastProvider  — actions fire toasts, so it wraps the store
 *   StoreProvider  — the single source of application state
 *   RouterProvider — inside the store, so route guards can read onboarding
 */
export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <StoreProvider>
            <RouterProvider>
              <AppRoot />
            </RouterProvider>
          </StoreProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App

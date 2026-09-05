import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ThemePreference } from '@/core/types'

/**
 * ThemeProvider — System / Light / Dark (§45).
 *
 * The applied theme lives on <html data-theme>. "system" removes the
 * attribute entirely, letting the prefers-color-scheme block in tokens.css
 * decide; an explicit choice writes "light" or "dark", which wins in both
 * directions because those selectors are not inside a media query.
 *
 * Persistence is a localStorage mirror, NOT the source of truth. The real
 * value is Settings.theme in IndexedDB. The mirror exists purely so the
 * correct theme is painted on the very first frame, before the store has
 * hydrated — otherwise a dark-mode user sees a white flash on every launch.
 * The store calls setTheme() once it hydrates, and again whenever
 * saveSettings({ theme }) runs, so the two stay in step.
 */

const STORAGE_KEY = 'salestrack.theme'

export type ResolvedTheme = 'light' | 'dark'

export interface ThemeApi {
  /** What the agent chose. */
  theme: ThemePreference
  /** What is actually painted right now. */
  resolved: ResolvedTheme
  /** Applies and mirrors a preference. */
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeApi | null>(null)

function readStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* private mode, storage disabled — the system default is a fine answer */
  }
  return 'system'
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyToDocument(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/**
 * Applies the mirrored theme before React renders. Call from main.tsx so the
 * first paint of LoadingScreen is already the right colour.
 */
export function applyStoredThemeEarly(): void {
  if (typeof document === 'undefined') return
  applyToDocument(readStoredTheme())
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    typeof window === 'undefined' ? 'system' : readStoredTheme(),
  )
  const [systemResolved, setSystemResolved] = useState<ResolvedTheme>(() => systemTheme())

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState((prev) => (prev === next ? prev : next))
    applyToDocument(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* mirror is best-effort; Settings.theme in IndexedDB is authoritative */
    }
  }, [])

  // Apply on mount so a value restored from state matches the DOM.
  useEffect(() => {
    applyToDocument(theme)
  }, [theme])

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemResolved(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = theme === 'system' ? systemResolved : theme

  // Keep the browser chrome (status bar, address bar) in step with the app.
  useEffect(() => {
    const color = resolved === 'dark' ? '#0b1220' : '#f7f8fa'
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute('content', color))
  }, [resolved])

  const value = useMemo<ThemeApi>(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * useTheme — read or change the appearance preference.
 *
 * Settings > Appearance should call BOTH:
 *   saveSettings({ theme })   // persists to IndexedDB (the store also applies it)
 * Calling saveSettings alone is enough; the store forwards to setTheme.
 */
export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

export default ThemeProvider

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'

/**
 * router — a dependency-free hash router.
 *
 * Hash routing, not history routing, because the app is a file-served PWA
 * that must work from any scope without a server rewrite rule. There is no
 * react-router: the whole route table is four tabs and a handful of settings
 * sub-pages, and a router is not worth 12KB of an offline bundle.
 *
 * URL shape:   #/sales?tab=month&date=2026-09-04
 *              ^path            ^query
 */

/* ------------------------------------------------------------------- routes */

export const ROUTES = {
  home: '/',
  sales: '/sales',
  insights: '/insights',
  settings: '/settings',
  settingsGoals: '/settings/goals',
  settingsCommission: '/settings/commission',
  settingsCategories: '/settings/categories',
  settingsSchedule: '/settings/schedule',
  settingsAppearance: '/settings/appearance',
  settingsData: '/settings/data',
  settingsAbout: '/settings/about',
  onboarding: '/onboarding',
} as const

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]

/** The four bottom-nav destinations (§6). */
export type PrimaryTab = 'home' | 'sales' | 'insights' | 'settings'

export interface Location {
  /** Always starts with '/', never contains '?' or '#'. */
  path: string
  /** Parsed query string. */
  query: Record<string, string>
  /** Path split into segments, e.g. '/settings/goals' -> ['settings','goals']. */
  segments: string[]
  /** Which bottom-nav tab should read as active. */
  tab: PrimaryTab
}

export interface NavigateOptions {
  /** Replace the current entry instead of pushing a new one. */
  replace?: boolean
  /** Query parameters appended to the path. */
  query?: Record<string, string | number | undefined | null>
}

/* ------------------------------------------------------------------ parsing */

function parseHash(hash: string): Location {
  const raw = hash.replace(/^#/, '') || '/'
  const [rawPath = '/', rawQuery = ''] = raw.split('?')

  let path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  const query: Record<string, string> = {}
  if (rawQuery) {
    for (const [key, value] of new URLSearchParams(rawQuery)) query[key] = value
  }

  const segments = path.split('/').filter(Boolean)
  const head = segments[0]
  const tab: PrimaryTab =
    head === 'sales' || head === 'insights' || head === 'settings' ? head : 'home'

  return { path, query, segments, tab }
}

function buildHash(path: string, query?: NavigateOptions['query']): string {
  const entries = Object.entries(query ?? {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (entries.length === 0) return `#${path}`
  const search = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  return `#${path}?${search}`
}

/* ------------------------------------------------------------------ context */

export interface RouterApi extends Location {
  navigate: (path: string, options?: NavigateOptions) => void
  /** Browser back. Falls back to Home when there is nothing to go back to. */
  back: () => void
  /** Merges into the current query without changing the path. */
  setQuery: (patch: Record<string, string | number | undefined | null>) => void
}

const RouterContext = createContext<RouterApi | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<Location>(() =>
    parseHash(typeof window === 'undefined' ? '#/' : window.location.hash),
  )

  useEffect(() => {
    const onHashChange = () => setLocation(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    // Normalise a bare URL to '#/' so the first entry is a real route.
    if (!window.location.hash) window.location.replace(`${window.location.pathname}#/`)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((path: string, options: NavigateOptions = {}) => {
    const target = buildHash(path.startsWith('/') ? path : `/${path}`, options.query)
    if (window.location.hash === target) return
    if (options.replace) {
      window.location.replace(`${window.location.pathname}${window.location.search}${target}`)
      // `replace` does not always emit hashchange in every engine.
      setLocation(parseHash(target))
    } else {
      window.location.hash = target
    }
  }, [])

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back()
    else window.location.hash = '#/'
  }, [])

  const setQuery = useCallback(
    (patch: Record<string, string | number | undefined | null>) => {
      const next = { ...location.query, ...patch }
      navigate(location.path, { query: next, replace: true })
    },
    [location.path, location.query, navigate],
  )

  const value = useMemo<RouterApi>(
    () => ({ ...location, navigate, back, setQuery }),
    [location, navigate, back, setQuery],
  )

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

/** Current location plus navigation helpers. */
export function useRouter(): RouterApi {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used inside <RouterProvider>')
  return ctx
}

/** Just the navigate function — stable, so it never causes a re-render. */
export function useNavigate(): (path: string, options?: NavigateOptions) => void {
  return useRouter().navigate
}

/* --------------------------------------------------------------------- Link */

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
  query?: NavigateOptions['query']
  replace?: boolean
  children: ReactNode
}

/**
 * Link — an anchor with a real href, so middle-click and "open in new tab"
 * behave, while a plain click routes in place.
 */
export function Link({ to, query, replace, children, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter()
  const href = buildHash(to.startsWith('/') ? to : `/${to}`, query)

  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        navigate(to, { query, replace })
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

/**
 * Small helper for screens that own sub-routes: returns the segment after
 * `base`, or null. useSubRoute('/settings') on '/settings/goals' -> 'goals'.
 */
export function useSubRoute(base: string): string | null {
  const { path } = useRouter()
  if (!path.startsWith(base)) return null
  const rest = path.slice(base.length).replace(/^\//, '')
  return rest === '' ? null : (rest.split('/')[0] ?? null)
}

export default RouterProvider

import { useEffect, useRef, type ReactNode } from 'react'
import { BrandMark, Button } from '@/components'
import { Link, ROUTES, useRouter, type PrimaryTab } from './router'
import { useAddSale } from './store'
import './AppShell.css'

/* ------------------------------------------------------------------- icons
   Hand-drawn, 24px, stroke-only. No icon library: it would be dead weight in
   an offline bundle and §50 asks for restraint around the numbers anyway. */

const Icon = ({ d }: { d: string }) => (
  <svg
    className="shell__nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

const ICONS: Record<PrimaryTab, string> = {
  home: 'M3.6 10.4 12 3.8l8.4 6.6M5.6 9v10.2h12.8V9',
  sales: 'M4 5.5h16M4 12h16M4 18.5h10',
  insights: 'M4 19V5m0 14h16M8 15.5V11m4 4.5V7.5m4 8V13',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm8-3.2a8 8 0 0 0-.14-1.5l2-1.55-2-3.46-2.4.96a8 8 0 0 0-2.6-1.5L14.5 2h-5l-.36 2.55a8 8 0 0 0-2.6 1.5l-2.4-.96-2 3.46 2 1.55a8.1 8.1 0 0 0 0 3l-2 1.55 2 3.46 2.4-.96a8 8 0 0 0 2.6 1.5L9.5 22h5l.36-2.55a8 8 0 0 0 2.6-1.5l2.4.96 2-3.46-2-1.55c.09-.49.14-.99.14-1.5Z',
}

const PlusIcon = () => (
  <svg
    className="shell__fab-plus"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/* -------------------------------------------------------------------- nav */

interface NavDestination {
  tab: PrimaryTab
  to: string
  label: string
}

const NAV: NavDestination[] = [
  { tab: 'home', to: ROUTES.home, label: 'Home' },
  { tab: 'sales', to: ROUTES.sales, label: 'Sales' },
  { tab: 'insights', to: ROUTES.insights, label: 'Insights' },
  { tab: 'settings', to: ROUTES.settings, label: 'Settings' },
]

export interface AppShellProps {
  /** The routed screen. */
  children: ReactNode
  /**
   * Globally-mounted overlays that must be available from every tab — most
   * importantly the Home team's Add Sale sheet, which the FAB opens through
   * `useAddSale()`. Wired in App.tsx.
   */
  overlays?: ReactNode
  /** Hide navigation entirely — used by the onboarding gate (§7). */
  chromeless?: boolean
}

/**
 * AppShell — the layout, and the only place navigation exists.
 *
 * MOBILE (< 900px): scrolling content, a fixed four-item bottom bar, and a
 * floating "+ Sale" pill above it on the right, within thumb reach (§6, §58).
 *
 * DESKTOP (>= 900px): the bottom bar and the floating button both disappear.
 * The same four destinations become a left rail, and "+ Sale" becomes the
 * rail's primary button at the top — so it is still the most prominent
 * control, just where a pointer expects it. Content is centred and capped at
 * --content-max; screens opt into multiple columns with .shell-split and
 * .shell-metrics rather than rearranging themselves (§59: not a different app).
 */
export function AppShell({ children, overlays, chromeless = false }: AppShellProps) {
  const { tab, path } = useRouter()
  const addSale = useAddSale()

  /* Route change focus (SPA equivalent of a page load). Without this, focus
     stays on the nav item that was just activated and a screen-reader user is
     never told the screen changed; the virtual cursor also stays parked at the
     bottom of the document. Moving focus to <main> puts them at the top of the
     new screen, and main's accessible name announces which screen it is.
     Skipped on first paint so the app does not steal focus at boot. */
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [path])

  if (chromeless) {
    return (
      <div className="shell shell--chromeless">
        <main className="shell__main" id="main" ref={mainRef} tabIndex={-1}>
          <div className="shell__content">{children}</div>
        </main>
        {overlays}
      </div>
    )
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/* Desktop rail */}
      <nav className="shell__rail" aria-label="Main">
        <div className="shell__brand">
          <BrandMark size={28} />
          <span>
            SalesAgent<b>OS</b>
          </span>
        </div>

        <Button
          variant="primary"
          block
          className="shell__rail-cta"
          icon={<PlusIcon />}
          onClick={() => addSale.open()}
        >
          Add Sale
        </Button>

        {NAV.map((item) => (
          <Link
            key={item.tab}
            to={item.to}
            className="shell__rail-item"
            aria-current={tab === item.tab ? 'page' : undefined}
          >
            <Icon d={ICONS[item.tab]} />
            {item.label}
          </Link>
        ))}

        <div className="shell__rail-spacer" />
        <p className="shell__rail-footer">Stored on this device</p>
      </nav>

      <main
        className="shell__main"
        id="main"
        ref={mainRef}
        tabIndex={-1}
        aria-label={NAV.find((n) => n.tab === tab)?.label ?? 'Main content'}
      >
        <div className="shell__content pad-for-nav">{children}</div>
      </main>

      {/* Mobile: floating + Sale, then the bottom bar */}
      <button
        type="button"
        className="shell__fab"
        onClick={() => addSale.open()}
        aria-label="Add a sale"
      >
        <PlusIcon />
        Sale
      </button>

      <nav className="shell__nav" aria-label="Main">
        {NAV.map((item) => (
          <Link
            key={item.tab}
            to={item.to}
            className="shell__nav-item"
            aria-current={tab === item.tab ? 'page' : undefined}
          >
            <Icon d={ICONS[item.tab]} />
            {item.label}
          </Link>
        ))}
      </nav>

      {overlays}
    </div>
  )
}

export default AppShell

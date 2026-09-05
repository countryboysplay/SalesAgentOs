import type { ReactNode } from 'react'
import './PageHeader.css'

export interface PageHeaderProps {
  /** e.g. "Sales", "Insights", or "Good afternoon, Jonathan" on Home. */
  title: ReactNode
  /** e.g. "Friday, September 4". */
  subtitle?: ReactNode
  /**
   * Shows the local-storage reassurance line (§9). The wording is fixed by
   * §62 and must not be changed to anything mentioning connection or sync.
   */
  showStoredLocally?: boolean
  /** Override the status text. Must still obey §62. */
  statusText?: string
  /** Back affordance for nested settings routes. */
  onBack?: () => void
  backLabel?: string
  /** Trailing controls, e.g. a filter button. */
  actions?: ReactNode
  className?: string
}

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M12.5 4.5 7 10l5.5 5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * PageHeader — the standard screen title block.
 *
 * The status line says "Saved on this device". It never says Synced,
 * Connected, or Offline, because there is nothing to connect to (§61, §62).
 */
export function PageHeader({
  title,
  subtitle,
  showStoredLocally = false,
  statusText = 'Saved on this device',
  onBack,
  backLabel = 'Back',
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={`page-header${className ? ` ${className}` : ''}`}>
      <div className="page-header__main">
        {onBack && (
          <button type="button" className="page-header__back" onClick={onBack} aria-label={backLabel}>
            <BackIcon />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 className="page-header__title">{title}</h1>
          {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
          {showStoredLocally && (
            <p className="page-header__status">
              <span className="page-header__status-dot" aria-hidden="true" />
              {statusText}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}

export default PageHeader

import type { ReactNode, CSSProperties } from 'react'
import './StatTile.css'

export type StatSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero'
export type StatTone = 'default' | 'accent' | 'positive' | 'warning' | 'negative' | 'muted'

export interface StatTileProps {
  /** Small uppercase eyebrow, e.g. "TODAY", "MONTH", "AVG SALE". */
  label: ReactNode
  /**
   * The figure. Pass an already-formatted string from src/core/format.ts —
   * StatTile never formats money and never receives raw cents.
   */
  value: ReactNode
  /** Supporting line under the figure, e.g. "148% of $500 goal". */
  sub?: ReactNode
  /** Colours only the sub-label. Keeps the headline figure neutral. */
  subTone?: 'default' | 'positive' | 'warning' | 'negative'
  /** 'hero' is reserved for the Today figure on Home (§10). */
  size?: StatSize
  /** Colours the figure itself. Use sparingly. */
  tone?: StatTone
  align?: 'start' | 'center'
  /**
   * Screen-reader sentence replacing the label+value+sub reading order.
   * Supply when the visual text is elliptical, e.g. "+$242 / Above Goal".
   */
  ariaLabel?: string
  className?: string
  style?: CSSProperties
}

/**
 * StatTile — the number primitive. Spec §50: numbers are the primary visual
 * language, so this is the most-used component in the app.
 */
export function StatTile({
  label,
  value,
  sub,
  subTone = 'default',
  size = 'md',
  tone = 'default',
  align = 'start',
  ariaLabel,
  className,
  style,
}: StatTileProps) {
  const classes = [
    'stat',
    `stat--${size}`,
    tone !== 'default' ? `stat--tone-${tone}` : '',
    align === 'center' ? 'stat--center' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} style={style} role="group" aria-label={ariaLabel}>
      <span className="stat__label" aria-hidden={ariaLabel ? true : undefined}>
        {label}
      </span>
      <span className="stat__value" aria-hidden={ariaLabel ? true : undefined}>
        {value}
      </span>
      {sub != null && (
        <span
          className={`stat__sub${subTone !== 'default' ? ` stat__sub--${subTone}` : ''}`}
          aria-hidden={ariaLabel ? true : undefined}
        >
          {sub}
        </span>
      )}
    </div>
  )
}

export interface StatGridProps {
  children: ReactNode
  /** Columns on mobile. Desktop layouts should override via CSS if needed. */
  columns?: 2 | 3 | 4
  className?: string
}

/** Row of StatTiles — the §11 Month / Year / Commission strip. */
export function StatGrid({ children, columns = 3, className }: StatGridProps) {
  return (
    <div
      className={`stat-grid${className ? ` ${className}` : ''}`}
      style={{ ['--stat-grid-cols' as string]: String(columns) }}
    >
      {children}
    </div>
  )
}

export default StatTile

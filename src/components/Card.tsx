import type { ReactNode, HTMLAttributes, MouseEventHandler } from 'react'
import './Card.css'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'
export type CardTone =
  | 'default'
  | 'flat'
  | 'sunken'
  | 'accent'
  | 'positive'
  | 'warning'
  | 'negative'
  | 'glass'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title' | 'onClick'> {
  children: ReactNode
  /** Internal spacing. Default 'md' (20px) — spec §49 asks for generous padding. */
  padding?: CardPadding
  /**
   * Visual treatment. Use 'accent' at most once per screen. 'glass' is the
   * command-center HUD panel — frosted, glow-bordered — reserved for Home's
   * primary cards; it renders a translucent backdrop-blur so use it against a
   * screen background, not stacked on another surface.
   */
  tone?: CardTone
  /** Optional header title rendered above the children. */
  title?: ReactNode
  /** Optional trailing control in the header row (a link, a menu button). */
  headerAction?: ReactNode
  /**
   * Makes the whole card a button. When set, the element renders as <button>
   * and gains hover/press affordances. Do not nest other buttons inside.
   */
  onClick?: MouseEventHandler<HTMLButtonElement>
  /** Required when onClick is set and the visible label is a bare number. */
  ariaLabel?: string
  className?: string
  /** Rendered element when not interactive. Default 'section'. */
  as?: 'section' | 'div' | 'article' | 'li'
}

const TONE_CLASS: Record<CardTone, string> = {
  default: '',
  flat: 'card--flat',
  sunken: 'card--sunken',
  accent: 'card--accent',
  positive: 'card--positive',
  warning: 'card--warning',
  negative: 'card--negative',
  glass: 'card--glass',
}

/**
 * Card — the single container primitive. Every panel in SalesTrack is a Card;
 * screens should not hand-roll bordered boxes.
 */
export function Card({
  children,
  padding = 'md',
  tone = 'default',
  title,
  headerAction,
  onClick,
  ariaLabel,
  className,
  as = 'section',
  ...rest
}: CardProps) {
  const classes = [
    'card',
    `card--pad-${padding}`,
    TONE_CLASS[tone],
    onClick ? 'card--interactive' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      {tone === 'glass' && <span className="card__glass-sweep" aria-hidden="true" />}
      {(title || headerAction) && (
        <div className="card__header">
          {title ? <h2 className="card__title">{title}</h2> : <span />}
          {headerAction ? <div className="card__action">{headerAction}</div> : null}
        </div>
      )}
      {children}
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-label={ariaLabel} {...rest}>
        {inner}
      </button>
    )
  }

  const Tag = as
  return (
    <Tag className={classes} aria-label={ariaLabel} {...rest}>
      {inner}
    </Tag>
  )
}

export default Card

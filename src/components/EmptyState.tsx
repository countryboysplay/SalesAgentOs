import type { ReactNode } from 'react'
import './EmptyState.css'

export interface EmptyStateProps {
  /** Headline. Spec §57 wording: "Nothing on the board yet." */
  title: ReactNode
  /** One supporting line. "Record your first sale when it comes in." */
  body?: ReactNode
  /** A single Button. Two actions here is one too many. */
  action?: ReactNode
  /** Optional glyph. Defaults to a quiet ledger mark. Pass null for none. */
  icon?: ReactNode | null
  /** Tighter spacing for an empty state inside a card rather than a screen. */
  compact?: boolean
  /**
   * Heading level for `title`. Default 3, which is right when this sits inside
   * a titled Card (an h2). Pass 2 when it renders directly under the screen h1,
   * or the outline skips a level.
   */
  headingLevel?: 2 | 3 | 4
  className?: string
}

const DefaultMark = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 19V5m0 14h16M8 15V9m4 6V6m4 9v-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * EmptyState — spec §57.
 *
 * Copy rules: never apologise, never say "no data", never mention loading or
 * connection. State what will appear here and how to make it appear.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  compact = false,
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  const mark = icon === null ? null : (icon ?? <DefaultMark />)
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'

  return (
    <div
      className={`empty${compact ? ' empty--compact' : ''}${className ? ` ${className}` : ''}`}
      role="status"
    >
      {mark && <div className="empty__mark">{mark}</div>}
      <Heading className="empty__title">{title}</Heading>
      {body && <p className="empty__body">{body}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

export default EmptyState

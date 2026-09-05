import type { ReactNode } from 'react'
import './Chip.css'

export interface ChipProps {
  children: ReactNode
  /** Toggle state. Renders aria-pressed and a check glyph when true. */
  selected?: boolean
  onClick?: () => void
  /** Optional leading glyph — Category.icon is an emoji or short glyph. */
  icon?: ReactNode
  disabled?: boolean
  size?: 'sm' | 'md'
  /** Override the accessible name when children are decorative. */
  ariaLabel?: string
  className?: string
}

const CheckIcon = () => (
  <svg className="chip__check" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M13.3 4.3 6.4 11.2 2.7 7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * Chip — a selectable quick-pick. Used for category chips in Add Sale (§14)
 * and for filter values in the Sales ledger (§71).
 *
 * Selection is signalled three ways: aria-pressed, a check glyph, and a tint.
 */
export function Chip({
  children,
  selected = false,
  onClick,
  icon,
  disabled = false,
  size = 'md',
  ariaLabel,
  className,
}: ChipProps) {
  return (
    <button
      type="button"
      className={`chip chip--${size}${className ? ` ${className}` : ''}`}
      aria-pressed={selected}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {selected ? <CheckIcon /> : icon ? <span className="chip__icon">{icon}</span> : null}
      {children}
    </button>
  )
}

export interface ChipRowProps {
  children: ReactNode
  /** Wrap onto multiple lines instead of scrolling horizontally. */
  wrap?: boolean
  /** Group label for assistive tech, e.g. "Sale category". */
  label?: string
  className?: string
}

/** Horizontally scrolling rail of chips. */
export function ChipRow({ children, wrap = false, label, className }: ChipRowProps) {
  return (
    <div
      className={`chip-row${wrap ? ' chip-row--wrap' : ''}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  )
}

export default Chip

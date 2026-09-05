import { useId } from 'react'
import './BrandMark.css'

export interface BrandMarkProps {
  /** Pixel size, applied to both width and height. Default 28. */
  size?: number
  className?: string
}

/**
 * BrandMark — the SalesAgentOS mark: three ascending bars into an arrow, in a
 * blue-to-cyan gradient. A recreated placeholder for the product's real logo
 * (per design direction); swap the two gradient stops if that changes.
 *
 * Shared by the desktop rail, the loading/error screen and onboarding's
 * welcome row so the three never drift into three different marks.
 */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  const gradId = useId()

  return (
    <svg
      className={['brand-mark', className ?? ''].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="SalesAgentOS"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="32" x2="32" y2="0">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#7dd3fc" />
        </linearGradient>
      </defs>
      <rect x="2" y="21" width="5" height="9" rx="1.5" fill={`url(#${gradId})`} opacity="0.55" />
      <rect x="10" y="15" width="5" height="15" rx="1.5" fill={`url(#${gradId})`} opacity="0.8" />
      <rect x="18" y="9" width="5" height="21" rx="1.5" fill={`url(#${gradId})`} />
      <path
        d="M20 4 L29 3 L30 12"
        stroke={`url(#${gradId})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export default BrandMark

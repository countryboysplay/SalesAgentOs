import type { ReactNode } from 'react'
import './ProgressBar.css'

export type ProgressTone = 'accent' | 'positive' | 'warning' | 'negative' | 'neutral'
export type ProgressSize = 'sm' | 'md' | 'lg'

export interface ProgressBarProps {
  /**
   * Fraction, NOT percent. 0.785 -> 78.5%. Uncapped: 1.24 is valid and is
   * rendered as a surplus segment rather than clipped (spec §51).
   * This is exactly the shape of PaceResult.progress.
   */
  value: number
  /** Left-hand caption, e.g. "$7,850 / $10,000". */
  caption?: ReactNode
  /** Right-hand figure. Omit to have the component render "78.5%" itself. */
  valueLabel?: ReactNode
  /** Hide the built-in percentage on the right. */
  hideValueLabel?: boolean
  /** Small line under the bar, e.g. "$238.89 per workday to finish". */
  footnote?: ReactNode
  /**
   * Optional "expected by today" tick, as a fraction on the same scale as
   * `value` (PaceResult.expected / goal). Rendered as a hairline.
   */
  markerAt?: number
  markerLabel?: string
  tone?: ProgressTone
  size?: ProgressSize
  /**
   * Accessible name. REQUIRED — a bare bar with no label is meaningless to a
   * screen reader. e.g. "Monthly goal progress".
   */
  label: string
  className?: string
}

function formatPercent(fraction: number): string {
  const pct = fraction * 100
  if (!Number.isFinite(pct)) return '0%'
  // Whole numbers past 100% read better without a decimal: "124%", "78.5%".
  const decimals = pct >= 100 || Number.isInteger(pct) ? 0 : 1
  return `${pct.toFixed(decimals)}%`
}

/**
 * ProgressBar — the goal visualisation primitive.
 *
 * Under 100% the fill grows left to right as usual.
 *
 * At and above 100% the track rescales instead of clipping: the goal line
 * slides to 1/value of the width and the surplus paints beyond it in the
 * positive colour. At 124% the goal marker sits at ~81% and the last ~19%
 * is visibly "extra". The bar is therefore always full once the goal is met,
 * and the amount of overshoot is legible at a glance.
 */
export function ProgressBar({
  value,
  caption,
  valueLabel,
  hideValueLabel = false,
  footnote,
  markerAt,
  markerLabel,
  tone = 'accent',
  size = 'md',
  label,
  className,
}: ProgressBarProps) {
  const safe = Number.isFinite(value) && value > 0 ? value : 0
  const isOver = safe > 1

  // Below 100%: single fill. Above: goal segment + surplus segment.
  const basePct = isOver ? (1 / safe) * 100 : safe * 100
  const overflowPct = isOver ? 100 - basePct : 0

  // The marker shares the same rescaled coordinate space as the fill.
  const markerPct =
    markerAt != null && Number.isFinite(markerAt) && markerAt > 0
      ? Math.min(100, isOver ? (markerAt / safe) * 100 : markerAt * 100)
      : null

  const percentText = formatPercent(safe)

  const classes = [
    'progress',
    `progress--${size}`,
    `progress--tone-${tone}`,
    isOver ? 'progress--over' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {(caption || (!hideValueLabel && (valueLabel || percentText))) && (
        <div className="progress__labels">
          <span className="progress__caption">{caption}</span>
          {!hideValueLabel && (
            <span className="progress__value num">{valueLabel ?? percentText}</span>
          )}
        </div>
      )}

      <div
        className="progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(safe * 100)}
        aria-valuetext={[
          isOver ? `${percentText} of goal — goal exceeded` : `${percentText} of goal`,
          // The "expected by today" tick is a hairline and is aria-hidden, so
          // without this the pace reference point exists only for sighted users.
          markerPct != null && markerLabel ? markerLabel : null,
        ]
          .filter(Boolean)
          .join('. ')}
      >
        <div className="progress__fill" style={{ width: `${basePct}%` }} />
        {isOver && <div className="progress__overflow" style={{ width: `${overflowPct}%` }} />}
        {markerPct != null && (
          <span
            className="progress__marker"
            style={{ left: `${markerPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      {footnote && <p className="progress__footnote">{footnote}</p>}
    </div>
  )
}

export default ProgressBar

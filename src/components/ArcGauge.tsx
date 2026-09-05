import { useId, type ReactNode } from 'react'
import { arcGaugeGeometry } from './arcGeometry'
import './ArcGauge.css'

export type ArcGaugeTone = 'accent' | 'positive' | 'warning' | 'neutral'

export interface ArcGaugeProps {
  /**
   * Fraction, NOT percent — same convention as ProgressBar.value. Uncapped
   * upstream (values past 1 are valid PaceResult.progress), but the sweep
   * itself always clamps to a full arc past 100%; a semicircle has no room
   * for ProgressBar's rescaling trick. Pair with `valueLabel` for the exact
   * number, which is never clamped.
   */
  progress: number
  /** The centred readout, e.g. "78%". Already formatted — this never formats. */
  valueLabel: ReactNode
  /** Small caption under the value, e.g. "of goal". */
  unitLabel?: ReactNode
  tone?: ArcGaugeTone
  /**
   * Accessible name for the whole gauge, e.g. "78% of your $3,000 daily
   * goal — behind pace". Required: the visible readout alone is elliptical.
   */
  label: string
  className?: string
}

const RADIUS = 55
const ARC_PATH = 'M10,65 A55,55 0 0 1 120,65'

/**
 * ArcGauge — the semicircle goal dial on Home's Today card (§10 HUD pass).
 *
 * A second, glanceable read of the same `PaceResult.progress` ProgressBar
 * already renders elsewhere on the card — this does not replace the
 * percent/status word/glyph logic (paceStatus.tsx), only gives it a dial.
 */
export function ArcGauge({
  progress,
  valueLabel,
  unitLabel,
  tone = 'accent',
  label,
  className,
}: ArcGaugeProps) {
  const gradId = useId()
  const { circumference, offset } = arcGaugeGeometry(RADIUS, progress)

  const classes = ['arc-gauge', `arc-gauge--tone-${tone}`, className ?? ''].filter(Boolean).join(' ')

  return (
    <div className={classes} role="img" aria-label={label}>
      <svg viewBox="0 0 130 72" className="arc-gauge__svg" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" className="arc-gauge__stop-start" />
            <stop offset="100%" className="arc-gauge__stop-end" />
          </linearGradient>
        </defs>
        <path d={ARC_PATH} className="arc-gauge__track" fill="none" strokeLinecap="round" />
        <path
          d={ARC_PATH}
          className="arc-gauge__fill"
          fill="none"
          strokeLinecap="round"
          stroke={`url(#${gradId})`}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className="arc-gauge__readout">
        <span className="arc-gauge__value num">{valueLabel}</span>
        {unitLabel != null && <span className="arc-gauge__unit">{unitLabel}</span>}
      </div>
    </div>
  )
}

export default ArcGauge

import './MiniBars.css'

export interface MiniBarsProps {
  /**
   * Real, already-aggregated figures to plot as relative bar heights (e.g. net
   * sales per day). Purely decorative — never the sole carrier of a number, so
   * it is rendered `aria-hidden` and must always sit beside the real figure
   * (StatTile's own formatted value), never instead of it.
   */
  values: readonly number[]
  className?: string
}

/**
 * MiniBars — the small sparkline strip under a StatTile (§11 HUD pass).
 *
 * Bars are relative to the largest value in the series, not to any goal, so
 * this answers "trending up or down lately", not "on pace" — ArcGauge and
 * ProgressBar already own the goal question elsewhere on the screen.
 */
export function MiniBars({ values, className }: MiniBarsProps) {
  if (values.length === 0) return null

  const max = Math.max(1, ...values.map((v) => Math.abs(v)))

  return (
    <div className={['mini-bars', className ?? ''].filter(Boolean).join(' ')} aria-hidden="true">
      {values.map((value, index) => {
        // A floor so a $0 day still reads as a bar, not a gap — the point is
        // shape-of-trend, not a precise axis.
        const pct = Math.max(6, Math.round((Math.abs(value) / max) * 100))
        return (
          <span
            key={index}
            className="mini-bars__bar"
            style={{ height: `${pct}%`, animationDelay: `${index * 40}ms` }}
          />
        )
      })}
    </div>
  )
}

export default MiniBars

/**
 * Pure geometry for the ArcGauge semicircle sweep.
 *
 * Kept separate from the component so it is trivially unit-testable and so
 * the arc length is always DERIVED from the radius rather than a hand-typed
 * constant — a stale hard-coded circumference is exactly the kind of bug the
 * approved mockup had to have fixed by hand before this pass started.
 */

export interface ArcGeometry {
  /** Total length of the semicircle path, in SVG user units. */
  circumference: number
  /**
   * `stroke-dashoffset` for a path whose `stroke-dasharray` is `circumference`.
   * 0 draws the full arc; `circumference` draws none of it.
   */
  offset: number
}

/**
 * Semicircle arc length and dash-offset for a given radius and progress
 * fraction (same convention as ProgressBar.value: 0.785 -> 78.5%, not 78.5).
 *
 * The arc sweep itself is clamped to [0, 1] — a semicircle has no graceful way
 * to show "124% of goal" the way ProgressBar's rescaling track does, so an
 * overshoot always reads as a full sweep here. The exact percent still belongs
 * in the caller's `valueLabel` text (ArcGauge takes no numbers of its own; the
 * caller formats and passes the readout, per the render-boundary rule).
 */
export function arcGaugeGeometry(radius: number, progress: number): ArcGeometry {
  const circumference = Math.PI * radius
  const safe = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  return { circumference, offset: circumference * (1 - safe) }
}

/**
 * Rendering scales — NOT metrics.
 *
 * A bar's height and a calendar cell's fill are drawing decisions, not figures
 * the agent reads. Nothing here is ever displayed as a number: every value the
 * user sees comes from `src/core/calc` and `src/core/format`. Kept in its own
 * file so that stays obvious.
 */
import type { Cents } from '@/core/types'

/** Largest value in a series, or 0. Used only to size a chart's y-axis. */
export function peak(values: Iterable<Cents>): Cents {
  let max = 0
  for (const value of values) {
    if (value > max) max = value
  }
  return max
}

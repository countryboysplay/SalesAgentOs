/**
 * The Insights time range (spec §27) and the granularity it implies (spec §28).
 *
 * §28 asks for daily *or* weekly points "depending on selected range" and warns
 * against complicated chart controls, so granularity is derived here rather than
 * exposed as another knob. The rule is one of legibility: a hand-rolled SVG line
 * has to stay readable at 360px (§58), which is roughly 300px of plot area.
 *
 *   7 / 30 days  -> one point per day      (7 and 30 points: ~10px apart)
 *   90 days      -> one point per week     (~13 points, not 90 at 3px apart)
 *   Year         -> one point per month, trimmed to months that have happened
 *   All time     -> chosen from the actual span, so a two-week-old ledger still
 *                   draws a daily line instead of a single monthly dot
 */
import { addDays, daysBetween, startOfYear, todayIso } from '@/core/date'
import type { IsoDate } from '@/core/types'

export type InsightsRange = '7d' | '30d' | '90d' | 'year' | 'all'

/** Bucket size for the trend chart. */
export type Granularity = 'day' | 'week' | 'month'

export interface RangeOption {
  value: InsightsRange
  label: string
  ariaLabel: string
}

/** §27, in the spec's order. Labels are abbreviated so five fit at 360px. */
export const RANGE_OPTIONS: readonly RangeOption[] = [
  { value: '7d', label: '7D', ariaLabel: '7 days' },
  { value: '30d', label: '30D', ariaLabel: '30 days' },
  { value: '90d', label: '90D', ariaLabel: '90 days' },
  { value: 'year', label: 'Year', ariaLabel: 'This year' },
  { value: 'all', label: 'All', ariaLabel: 'All time' },
]

export const DEFAULT_RANGE: InsightsRange = '30d'

export function isInsightsRange(value: unknown): value is InsightsRange {
  return (
    value === '7d' || value === '30d' || value === '90d' || value === 'year' || value === 'all'
  )
}

export interface ResolvedRange {
  key: InsightsRange
  from: IsoDate
  to: IsoDate
  granularity: Granularity
  /** Section heading suffix: "Last 30 days", "2026 so far", "All time". */
  label: string
  /** Inclusive day count in the window. */
  days: number
}

/** Spans at or under these lengths keep the finer bucket on the All Time view. */
const ALL_DAILY_MAX_DAYS = 31
const ALL_WEEKLY_MAX_DAYS = 126

function span(from: IsoDate, to: IsoDate): number {
  return daysBetween(from, to) + 1
}

/**
 * Turn the selected range into a concrete window plus a granularity.
 *
 * `earliestSale` anchors All Time. With no sales at all it collapses to today,
 * which the screen treats as the first-run empty state rather than a chart.
 */
export function resolveRange(
  key: InsightsRange,
  today: IsoDate = todayIso(),
  earliestSale: IsoDate | null = null,
): ResolvedRange {
  switch (key) {
    case '7d': {
      const from = addDays(today, -6)
      return { key, from, to: today, granularity: 'day', label: 'Last 7 days', days: 7 }
    }
    case '30d': {
      const from = addDays(today, -29)
      return { key, from, to: today, granularity: 'day', label: 'Last 30 days', days: 30 }
    }
    case '90d': {
      const from = addDays(today, -89)
      return { key, from, to: today, granularity: 'week', label: 'Last 90 days', days: 90 }
    }
    case 'year': {
      const from = startOfYear(today)
      return {
        key,
        from,
        to: today,
        granularity: 'month',
        label: `${today.slice(0, 4)} so far`,
        days: span(from, today),
      }
    }
    case 'all':
    default: {
      const from = earliestSale ?? today
      const days = span(from, today)
      const granularity: Granularity =
        days <= ALL_DAILY_MAX_DAYS ? 'day' : days <= ALL_WEEKLY_MAX_DAYS ? 'week' : 'month'
      return { key: 'all', from, to: today, granularity, label: 'All time', days }
    }
  }
}

/** Caption for the chart meta line: "Daily totals", "Weekly totals", … */
export function granularityLabel(granularity: Granularity): string {
  switch (granularity) {
    case 'day':
      return 'Daily totals'
    case 'week':
      return 'Weekly totals'
    case 'month':
    default:
      return 'Monthly totals'
  }
}

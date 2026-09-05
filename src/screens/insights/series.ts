/**
 * Trend-series plumbing for the Insights chart.
 *
 * Nothing here does arithmetic on money or counts — every figure comes out of
 * `src/core/calc` (build contract, invariant 6). This module only *chooses*
 * which calc builder to call for the selected granularity, stitches the
 * multi-year monthly case together, reads the goal in force for each bucket,
 * and turns the finished series into the `.sr-only` sentence (§63).
 */
import { dailySeries, goalAmountFor, monthlySeries, selectSales, weeklySeries } from '@/core/calc'
import type { SeriesPoint } from '@/core/calc'
import { monthKey, yearOf } from '@/core/date'
import type { Cents, Goal, IsoDate, Sale, Weekday } from '@/core/types'
import type { Granularity } from './range'

/** The §28 toggle: Sales $ or Sale Count. There is no third option by design. */
export type TrendMetric = 'money' | 'count'

export interface SeriesRequest {
  sales: readonly Sale[]
  from: IsoDate
  to: IsoDate
  granularity: Granularity
  weekStartsOn: Weekday
  locale: string
}

/**
 * Monthly buckets across an arbitrary window.
 *
 * `monthlySeries` in calc covers exactly one calendar year (it exists for the
 * §25 annual bar chart), so All Time over several years is assembled from one
 * call per year and clipped to the window. This is composition, not arithmetic
 * — no figure is recomputed here.
 *
 * Trimming the tail matters: an untrimmed year would zero-fill October to
 * December and draw a cliff to $0 for months that simply have not happened yet.
 */
export function monthlyRangeSeries(
  sales: readonly Sale[],
  from: IsoDate,
  to: IsoDate,
  locale: string,
): SeriesPoint[] {
  const firstKey = monthKey(from)
  const lastKey = monthKey(to)
  const out: SeriesPoint[] = []
  for (let year = yearOf(from); year <= yearOf(to); year += 1) {
    for (const point of monthlySeries(sales, year, { locale })) {
      if (point.key >= firstKey && point.key <= lastKey) out.push(point)
    }
  }
  return out
}

/**
 * The zero-filled series for the selected range and granularity.
 *
 * Weekly buckets are the awkward case. `weeklySeries` widens the window to
 * whole weeks so the end bars are not half-height by accident — with
 * `weekStartsOn: 0` that is 1-6 days of extra money on the front of a 90-day
 * range unless today happens to be a Friday. The headline metrics and the
 * screen-reader summary use the exact window, so an unclipped chart would draw
 * a first point that no other figure on the screen agrees with.
 *
 * The fix is selection, not arithmetic: the sales handed to `weeklySeries` are
 * clipped to the range first, so the widened boundary only decides where the
 * buckets *start*, never what lands in them. The first bucket is then a partial
 * week worth exactly the in-range days — which is what `TrendSection` labels it
 * as, on the axis, in the readout and in the spoken summary.
 */
export function buildSeries(request: SeriesRequest): SeriesPoint[] {
  const { sales, from, to, granularity, weekStartsOn, locale } = request
  switch (granularity) {
    case 'day':
      return dailySeries(sales, from, to, { locale })
    case 'week':
      return weeklySeries(selectSales(sales, { from, to }), from, to, weekStartsOn, { locale })
    case 'month':
    default:
      return monthlyRangeSeries(sales, from, to, locale)
  }
}

/** The value the chart plots for a point, given the active toggle. */
export function valueOf(point: SeriesPoint, metric: TrendMetric): number {
  return metric === 'money' ? point.netSales : point.saleCount
}

export interface GoalReference {
  /** One entry per point. null where no goal was in force for that bucket. */
  values: (Cents | null)[]
  /** "Daily goal" / "Monthly goal" — used for the dashed-line legend. */
  name: string
  /** The single amount when the goal never changed across the window. */
  constantAmount: Cents | null
}

/**
 * The goal reference line (a subtle dashed step, §28).
 *
 * Only daily and monthly buckets get one, because those are the only goals the
 * data model actually holds (§32). A weekly line would mean inventing
 * "daily goal x workdays in that week", which is arithmetic this screen has no
 * business doing — so 90 Days simply shows no reference line.
 *
 * The line is read per bucket rather than once, so a goal that changed mid-range
 * steps instead of lying about history (§69).
 */
export function goalReference(
  points: readonly SeriesPoint[],
  granularity: Granularity,
  goals: readonly Goal[],
  metric: TrendMetric,
): GoalReference | null {
  if (metric !== 'money') return null // goals are money; a count line would be a fiction
  if (granularity === 'week') return null

  const type = granularity === 'day' ? 'daily' : 'monthly'
  const values = points.map((point) =>
    goalAmountFor(type, granularity === 'day' ? point.key : `${point.key}-01`, goals),
  )

  const present = values.filter((value): value is Cents => value !== null && value > 0)
  if (present.length === 0) return null

  const first = present[0] as Cents
  const constant = present.every((value) => value === first) && present.length === values.length
  return {
    values: values.map((value) => (value !== null && value > 0 ? value : null)),
    name: type === 'daily' ? 'Daily goal' : 'Monthly goal',
    constantAmount: constant ? first : null,
  }
}

// ---------------------------------------------------------------------------
// Screen-reader summary (§63) — every chart carries one.
// ---------------------------------------------------------------------------

export interface SummaryInput {
  points: readonly SeriesPoint[]
  metric: TrendMetric
  /** Long label for a bucket, e.g. "Sep 4", "week of Sep 1", "September 2026". */
  describePoint: (point: SeriesPoint) => string
  formatValue: (value: number) => string
  /** Already-formatted range total from calc — never summed here. */
  totalText: string
  rangeLabel: string
  bucketNoun: string
  goalText: string | null
  /**
   * Said after the point count, when the first bucket does not cover a whole
   * one — e.g. a 90-day range whose first week starts before the window. The
   * chart clips it to the range, so the sentence says so rather than letting a
   * reader assume seven days of data.
   */
  windowNote?: string | null
}

/**
 * A sentence a screen reader can act on: what the chart plots, how many points,
 * where it starts and ends, where the peak is, and how many buckets were empty.
 *
 * Deliberately reports facts rather than a fitted trend line — "up 12%" from a
 * noisy daily series would be a claim the chart cannot support.
 */
export function describeSeries(input: SummaryInput): string {
  const {
    points,
    metric,
    describePoint,
    formatValue,
    totalText,
    rangeLabel,
    bucketNoun,
    goalText,
    windowNote = null,
  } = input

  const measure = metric === 'money' ? 'Net sales' : 'Number of sales'
  if (points.length === 0) return `${measure} by ${bucketNoun}. Nothing recorded in this range yet.`

  const first = points[0] as SeriesPoint
  const last = points[points.length - 1] as SeriesPoint
  const values = points.map((point) => valueOf(point, metric))

  let peakIndex = 0
  let emptyBuckets = 0
  values.forEach((value, index) => {
    if (value > (values[peakIndex] as number)) peakIndex = index
    if (value <= 0) emptyBuckets += 1
  })
  const peak = points[peakIndex] as SeriesPoint

  const parts: string[] = [
    `Line chart. ${measure} by ${bucketNoun}, ${rangeLabel.toLowerCase()}.`,
    `${points.length} ${points.length === 1 ? 'point' : 'points'} from ${describePoint(first)} to ${describePoint(last)}.`,
  ]
  if (windowNote) parts.push(windowNote)
  parts.push(`Range total ${totalText}.`)

  if (points.length === 1) {
    parts.push(`The single point is ${formatValue(values[0] as number)}.`)
  } else {
    parts.push(
      `Starts at ${formatValue(values[0] as number)} and ends at ${formatValue(values[values.length - 1] as number)}.`,
    )
    parts.push(`Highest ${bucketNoun}: ${formatValue(values[peakIndex] as number)} on ${describePoint(peak)}.`)
    if (emptyBuckets > 0) {
      parts.push(
        `${emptyBuckets} of ${points.length} ${bucketNoun}s ${
          emptyBuckets === 1 ? 'has' : 'have'
        } nothing recorded.`,
      )
    }
  }

  if (goalText) parts.push(goalText)
  return parts.join(' ')
}

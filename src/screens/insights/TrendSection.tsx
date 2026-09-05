/**
 * Sales trend card (§28).
 *
 * The only control here is the Sales $ / Sale Count toggle the spec asks for.
 * Granularity is derived from the range (see `range.ts`) rather than offered as
 * a second control — §28 is explicit that the chart must not grow knobs.
 */
import { useMemo, useState } from 'react'
import { Card, EmptyState, SegmentedControl } from '@/components'
import { totalsFor } from '@/core/calc'
import type { SeriesPoint } from '@/core/calc'
import { endOfWeek } from '@/core/date'
import { formatCurrency, formatCurrencyCompact, formatDate, formatMonthKey, formatNumber } from '@/core/format'
import type { Goal, Sale, Settings } from '@/core/types'
import { TrendChart } from './TrendChart'
import type { TrendChartPoint } from './TrendChart'
import { buildSeries, describeSeries, goalReference, valueOf } from './series'
import type { TrendMetric } from './series'
import { granularityLabel } from './range'
import type { Granularity, ResolvedRange } from './range'

export interface TrendSectionProps {
  sales: readonly Sale[]
  goals: readonly Goal[]
  settings: Settings
  range: ResolvedRange
}

const METRIC_OPTIONS = [
  { value: 'money' as const, label: 'Sales $', ariaLabel: 'Show sales in dollars' },
  { value: 'count' as const, label: 'Sale Count', ariaLabel: 'Show number of sales' },
]

function bucketNoun(granularity: Granularity): string {
  return granularity === 'day' ? 'day' : granularity === 'week' ? 'week' : 'month'
}

/** Long-form bucket name for the readout and the screen-reader summary. */
function describePoint(point: SeriesPoint, granularity: Granularity, settings: Settings): string {
  if (granularity === 'month') return formatMonthKey(point.key, settings, 'monthYearShort')
  if (granularity === 'week') return `Week of ${formatDate(point.key, settings, 'short')}`
  return formatDate(point.key, settings, 'short')
}

export function TrendSection({ sales, goals, settings, range }: TrendSectionProps) {
  const [metric, setMetric] = useState<TrendMetric>('money')
  const { from, to, granularity } = range

  const series = useMemo(
    () =>
      buildSeries({
        sales,
        from,
        to,
        granularity,
        weekStartsOn: settings.weekStartsOn,
        locale: settings.locale,
      }),
    [sales, from, to, granularity, settings.weekStartsOn, settings.locale],
  )

  const totals = useMemo(() => totalsFor(sales, { from, to }), [sales, from, to])

  /**
   * Weekly buckets are keyed by the start of the week, which can fall before
   * the window — with `weekStartsOn: 0` a 90-day range starts on a week
   * boundary only when today is a Friday, and is 1-6 days early otherwise.
   * `buildSeries` clips the sales to the range so the first bucket is worth
   * only its in-range days; here it is also *named* for them — on the axis, in
   * the readout and in the spoken summary — so nothing claims a whole week the
   * chart never drew.
   */
  const firstKey = series.length > 0 ? (series[0] as SeriesPoint).key : null
  const partialFirstWeek = granularity === 'week' && firstKey !== null && firstKey < from
  const partialSpan = partialFirstWeek
    ? `${formatDate(from, settings, 'short')} to ${formatDate(
        endOfWeek(from, settings.weekStartsOn),
        settings,
        'short',
      )}`
    : null

  const describeAt = (point: SeriesPoint, index: number): string =>
    index === 0 && partialSpan !== null
      ? `Partial week, ${partialSpan}`
      : describePoint(point, granularity, settings)

  const describeByKey = useMemo(() => {
    const map = new Map<string, string>()
    series.forEach((point, index) => map.set(point.key, describeAt(point, index)))
    return map
    // describeAt is rebuilt every render but is pure in the values listed here.
  }, [series, granularity, settings, partialSpan])

  const reference = useMemo(
    () => goalReference(series, granularity, goals, metric),
    [series, granularity, goals, metric],
  )

  const formatMoney = (cents: number) => formatCurrency(cents, settings)
  const formatCount = (count: number) =>
    `${formatNumber(count, settings)} ${count === 1 ? 'sale' : 'sales'}`
  const formatValue = (value: number) => (metric === 'money' ? formatMoney(value) : formatCount(value))
  const formatAxisValue = (value: number) =>
    metric === 'money' ? formatCurrencyCompact(value, settings) : formatNumber(value, settings)

  const points: TrendChartPoint[] = useMemo(
    () =>
      series.map((point, index) => ({
        key: point.key,
        // The clipped bucket is labelled for the day it really starts on, in
        // the same style calc uses for every other tick.
        label:
          index === 0 && partialSpan !== null
            ? formatDate(from, settings, 'short')
            : point.label,
        description: describeByKey.get(point.key) ?? point.label,
        value: valueOf(point, metric),
        netSales: point.netSales,
        saleCount: point.saleCount,
        goal: reference ? reference.values[index] : null,
      })),
    [series, metric, reference, describeByKey, partialSpan, from, settings],
  )

  // Legend text for the dashed reference line. When the goal moved during the
  // window the line steps, so the legend says so instead of naming one amount.
  const goalName = reference
    ? reference.constantAmount !== null
      ? `${reference.name} ${formatCurrency(reference.constantAmount, settings)}`
      : `${reference.name} (changed in this range)`
    : null

  const goalText = reference
    ? reference.constantAmount !== null
      ? `A dashed reference line marks the ${reference.name.toLowerCase()} of ${formatCurrency(
          reference.constantAmount,
          settings,
        )}.`
      : `A dashed reference line marks the ${reference.name.toLowerCase()}, which changed during this range.`
    : null

  const summary = useMemo(
    () =>
      describeSeries({
        points: series,
        metric,
        describePoint: (point) => describeByKey.get(point.key) ?? point.label,
        formatValue,
        // The total must be in the units the chart is plotting: announcing
        // "$900.00" over a line of sale counts describes a different chart.
        totalText:
          metric === 'money' ? formatCurrency(totals.netSales, settings) : formatCount(totals.saleCount),
        rangeLabel: range.label,
        bucketNoun: bucketNoun(granularity),
        goalText,
        windowNote:
          partialSpan === null
            ? null
            : `The first week is partial: it covers ${partialSpan}, where the range begins.`,
      }),
    // formatValue and formatCount are rebuilt every render but are pure in
    // `metric` and `settings`, which are already dependencies.
    [
      series,
      metric,
      granularity,
      settings,
      totals.netSales,
      totals.saleCount,
      range.label,
      goalText,
      describeByKey,
      partialSpan,
    ],
  )

  const empty = totals.saleCount === 0 || series.length === 0

  return (
    <Card
      title="Sales Trend"
      headerAction={<span className="insights__scope">{granularityLabel(granularity)}</span>}
    >
      <SegmentedControl
        className="insights__toggle"
        label="Trend measure"
        options={METRIC_OPTIONS}
        value={metric}
        onChange={setMetric}
      />

      {empty ? (
        <EmptyState
          compact
          title="Your trend line starts with your first sale here."
          body={
            sales.length > 0
              ? 'Nothing landed in this range. Try a longer one above.'
              : 'Record a sale and the line begins drawing the same second.'
          }
        />
      ) : (
        <TrendChart
          points={points}
          seriesLabel={metric === 'money' ? 'Net sales' : 'Number of sales'}
          formatAxisValue={formatAxisValue}
          formatMoney={formatMoney}
          formatCount={formatCount}
          goalName={goalName}
          integerScale={metric === 'count'}
          summary={summary}
        />
      )}
    </Card>
  )
}

export default TrendSection

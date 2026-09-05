/**
 * Insights screen logic — the parts that decide what the chart draws.
 *
 * The SVG itself is geometry; these specs cover the decisions in front of it:
 * which window the range selector means, which bucket size that implies, and
 * that the thin-data cases (0, 1 and 2 points) produce something to draw and
 * something to say (§57, §63).
 */
import { describe, expect, it } from 'vitest'
import { makeGoal, makeSale } from '@/core/calc/fixtures'
import { totalsFor } from '@/core/calc'
import { resolveRange } from './range'
import { buildSeries, describeSeries, goalReference, monthlyRangeSeries, valueOf } from './series'

const LOCALE = 'en-US'
const TODAY = '2026-09-04' // a Friday

describe('resolveRange', () => {
  it('maps the fixed ranges to windows and bucket sizes', () => {
    expect(resolveRange('7d', TODAY)).toMatchObject({
      from: '2026-08-29',
      to: TODAY,
      granularity: 'day',
    })
    expect(resolveRange('30d', TODAY)).toMatchObject({ from: '2026-08-06', granularity: 'day' })
    // 90 daily points would be ~3px apart at 360px, so weeks it is (§28, §58).
    expect(resolveRange('90d', TODAY)).toMatchObject({ from: '2026-06-07', granularity: 'week' })
    expect(resolveRange('year', TODAY)).toMatchObject({ from: '2026-01-01', granularity: 'month' })
  })

  it('picks All Time granularity from the span, so a new ledger still gets a line', () => {
    expect(resolveRange('all', TODAY, '2026-09-01').granularity).toBe('day')
    expect(resolveRange('all', TODAY, '2026-07-01').granularity).toBe('week')
    expect(resolveRange('all', TODAY, '2024-01-01').granularity).toBe('month')
  })

  it('collapses All Time to today when there is nothing recorded', () => {
    const range = resolveRange('all', TODAY, null)
    expect(range.from).toBe(TODAY)
    expect(range.days).toBe(1)
  })
})

describe('buildSeries', () => {
  const sales = [
    makeSale({ amount: 20_000, date: '2026-09-01' }),
    makeSale({ amount: 30_000, date: '2026-09-01' }),
    makeSale({ amount: 50_000, date: '2026-09-04' }),
  ]

  it('zero-fills the quiet days rather than dropping them', () => {
    const points = buildSeries({
      sales,
      from: '2026-08-29',
      to: TODAY,
      granularity: 'day',
      weekStartsOn: 1,
      locale: LOCALE,
    })
    expect(points).toHaveLength(7)
    expect(points.map((p) => p.netSales)).toEqual([0, 0, 0, 50_000, 0, 0, 50_000])
    expect(points.map((p) => p.saleCount)).toEqual([0, 0, 0, 2, 0, 0, 1])
  })

  /**
   * The 90-day regression. `weeklySeries` widens to whole weeks, so with
   * `weekStartsOn: 0` the first bucket starts 1-6 days before the window on
   * every day except Friday — money the Performance card and the screen-reader
   * summary do not count. The series must describe the same window they do.
   */
  it('clips the widened first week to the range, so the chart totals what the card totals', () => {
    const range = resolveRange('90d', '2026-09-07') // a Monday: from = 2026-06-10
    expect(range.from).toBe('2026-06-10')

    const window = [
      makeSale({ amount: 120_000, date: '2026-06-09' }), // one day BEFORE the range
      makeSale({ amount: 40_000, date: '2026-06-10' }), // the first day IN it
    ]

    const points = buildSeries({
      sales: window,
      from: range.from,
      to: range.to,
      granularity: 'week',
      weekStartsOn: 0, // Sunday: the first bucket opens on 2026-06-07
      locale: LOCALE,
    })

    expect(points[0]?.key).toBe('2026-06-07')
    expect(points[0]?.netSales).toBe(40_000)
    expect(points[0]?.saleCount).toBe(1)

    const charted = points.reduce((sum, point) => sum + point.netSales, 0)
    expect(charted).toBe(totalsFor(window, { from: range.from, to: range.to }).netSales)
  })

  it('leaves week buckets alone when the range already starts on a week boundary', () => {
    const points = buildSeries({
      sales: [makeSale({ amount: 40_000, date: '2026-06-10' })],
      from: '2026-06-07',
      to: '2026-09-05',
      granularity: 'week',
      weekStartsOn: 0,
      locale: LOCALE,
    })
    expect(points[0]?.key).toBe('2026-06-07')
    expect(points[0]?.netSales).toBe(40_000)
  })

  it('keeps a single-point series intact instead of returning nothing', () => {
    const points = buildSeries({
      sales,
      from: TODAY,
      to: TODAY,
      granularity: 'day',
      weekStartsOn: 1,
      locale: LOCALE,
    })
    expect(points).toHaveLength(1)
    expect(valueOf(points[0], 'money')).toBe(50_000)
    expect(valueOf(points[0], 'count')).toBe(1)
  })
})

describe('monthlyRangeSeries', () => {
  it('spans years and stops at the current month, so the future is not a cliff to $0', () => {
    const sales = [
      makeSale({ amount: 100_000, date: '2025-11-20' }),
      makeSale({ amount: 250_000, date: '2026-02-03' }),
    ]
    const points = monthlyRangeSeries(sales, '2025-11-01', TODAY, LOCALE)
    expect(points[0]?.key).toBe('2025-11')
    expect(points[points.length - 1]?.key).toBe('2026-09')
    expect(points).toHaveLength(11)
    expect(points.find((p) => p.key === '2026-02')?.netSales).toBe(250_000)
    expect(points.some((p) => p.key === '2026-10')).toBe(false)
  })
})

describe('goalReference', () => {
  const points = buildSeries({
    sales: [],
    from: '2026-09-01',
    to: '2026-09-04',
    granularity: 'day',
    weekStartsOn: 1,
    locale: LOCALE,
  })

  it('reads the goal in force per bucket, so a mid-range change steps', () => {
    const goals = [
      makeGoal({ type: 'daily', amount: 40_000, effectiveFrom: '2026-01-01', effectiveTo: '2026-09-02' }),
      makeGoal({ type: 'daily', amount: 60_000, effectiveFrom: '2026-09-03' }),
    ]
    const reference = goalReference(points, 'day', goals, 'money')
    expect(reference?.values).toEqual([40_000, 40_000, 60_000, 60_000])
    expect(reference?.constantAmount).toBeNull()
    expect(reference?.name).toBe('Daily goal')
  })

  it('reports a single amount when the goal never moved', () => {
    const goals = [makeGoal({ type: 'daily', amount: 50_000, effectiveFrom: '2026-01-01' })]
    expect(goalReference(points, 'day', goals, 'money')?.constantAmount).toBe(50_000)
  })

  it('draws no line for weekly buckets or for the count toggle', () => {
    const goals = [makeGoal({ type: 'daily', amount: 50_000, effectiveFrom: '2026-01-01' })]
    expect(goalReference(points, 'week', goals, 'money')).toBeNull()
    expect(goalReference(points, 'day', goals, 'count')).toBeNull()
  })

  it('is absent when no goal is in force', () => {
    expect(goalReference(points, 'day', [], 'money')).toBeNull()
  })
})

describe('describeSeries', () => {
  const describePoint = (point: { key: string }) => point.key
  const formatValue = (value: number) => `$${value / 100}`
  const base = {
    metric: 'money' as const,
    describePoint,
    formatValue,
    totalText: '$700',
    rangeLabel: 'Last 7 days',
    bucketNoun: 'day',
    goalText: null,
  }

  it('says what an empty range means instead of describing an empty axis', () => {
    expect(describeSeries({ ...base, points: [] })).toContain('Nothing recorded in this range yet')
  })

  it('describes a single point without claiming a trend', () => {
    const points = [{ key: '2026-09-04', label: 'Sep 4', netSales: 50_000, saleCount: 1 }]
    const text = describeSeries({ ...base, points })
    expect(text).toContain('1 point')
    expect(text).toContain('The single point is $500')
    expect(text).not.toContain('Starts at')
  })

  it('announces the total in the units being plotted, not always in money', () => {
    const points = [{ key: 'a', label: 'a', netSales: 90_000, saleCount: 2 }]
    const text = describeSeries({
      ...base,
      metric: 'count',
      points,
      formatValue: (value) => `${value} sales`,
      totalText: '3 sales',
    })
    expect(text).toContain('Number of sales by day')
    expect(text).toContain('Range total 3 sales.')
    expect(text).not.toContain('$')
  })

  it('says the first bucket is partial rather than letting it read as a whole week', () => {
    const points = [
      { key: '2026-06-07', label: 'Jun 7', netSales: 40_000, saleCount: 1 },
      { key: '2026-06-14', label: 'Jun 14', netSales: 10_000, saleCount: 1 },
    ]
    const text = describeSeries({
      ...base,
      points,
      bucketNoun: 'week',
      windowNote: 'The first week is partial: it covers Jun 10 to Jun 13, where the range begins.',
    })
    expect(text).toContain('The first week is partial: it covers Jun 10 to Jun 13')
    // Said before the total, so the total is read in context.
    expect(text.indexOf('partial')).toBeLessThan(text.indexOf('Range total'))
  })

  it('gives start, end, peak and the empty-bucket count for a real series', () => {
    const points = [
      { key: 'a', label: 'a', netSales: 0, saleCount: 0 },
      { key: 'b', label: 'b', netSales: 90_000, saleCount: 2 },
      { key: 'c', label: 'c', netSales: 30_000, saleCount: 1 },
    ]
    const text = describeSeries({ ...base, points, goalText: 'Goal line at $500.' })
    expect(text).toContain('3 points from a to c')
    expect(text).toContain('Starts at $0 and ends at $300')
    expect(text).toContain('Highest day: $900 on b')
    expect(text).toContain('1 of 3 days has nothing recorded')
    expect(text).toContain('Goal line at $500.')
  })
})

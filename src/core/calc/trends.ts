/**
 * Chart series (spec §25 annual bars, §28 sales trend).
 *
 * Every builder zero-fills: a day, week or month with no sales appears as a 0
 * point rather than vanishing, so a gap in the ledger reads as a gap in the
 * chart instead of silently compressing the axis.
 */
import {
  addDays,
  compareIso,
  daysInRange,
  endOfMonth,
  endOfWeek,
  formatDayLabel,
  formatMonthLabel,
  isoForYear,
  monthKey,
  startOfMonth,
  startOfWeek,
  weekdayOf,
} from '../date'
import { effectiveAmount, isActive } from './totals'
import type { Cents, IsoDate, Sale, Weekday } from '../types'

export interface SeriesPoint {
  /** Bucket key: an IsoDate for days and weeks, 'YYYY-MM' for months. */
  key: string
  /** Short axis label, e.g. 'Sep 4' or 'Jan'. */
  label: string
  netSales: Cents
  saleCount: number
}

export interface SeriesOptions {
  /** Locale for axis labels. Defaults to the runtime locale. */
  locale?: string
}

interface Bucket {
  netSales: Cents
  saleCount: number
}

function emptyBucket(): Bucket {
  return { netSales: 0, saleCount: 0 }
}

function accumulate(buckets: Map<string, Bucket>, key: string, sale: Sale): void {
  const bucket = buckets.get(key)
  if (!bucket) return // outside the requested window
  bucket.netSales += effectiveAmount(sale)
  if (isActive(sale)) bucket.saleCount += 1
}

/** One point per calendar day from `from` to `to`, inclusive. */
export function dailySeries(
  sales: readonly Sale[],
  from: IsoDate,
  to: IsoDate,
  options: SeriesOptions = {},
): SeriesPoint[] {
  if (compareIso(from, to) > 0) return []
  const buckets = new Map<string, Bucket>()
  for (const day of daysInRange(from, to)) buckets.set(day, emptyBucket())

  for (const sale of sales) {
    if (sale.date < from || sale.date > to) continue
    accumulate(buckets, sale.date, sale)
  }

  return [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: formatDayLabel(key, options.locale),
    netSales: bucket.netSales,
    saleCount: bucket.saleCount,
  }))
}

/**
 * One point per week. Buckets are keyed by the week's start date, which honours
 * the configured first day of the week; the range is widened to whole weeks so
 * the first and last bars are not half-height by accident.
 */
export function weeklySeries(
  sales: readonly Sale[],
  from: IsoDate,
  to: IsoDate,
  weekStartsOn: Weekday = 1,
  options: SeriesOptions = {},
): SeriesPoint[] {
  if (compareIso(from, to) > 0) return []
  const first = startOfWeek(from, weekStartsOn)
  const last = endOfWeek(to, weekStartsOn)

  const buckets = new Map<string, Bucket>()
  for (let cursor = first; compareIso(cursor, last) <= 0; cursor = addDays(cursor, 7)) {
    buckets.set(cursor, emptyBucket())
  }

  for (const sale of sales) {
    if (sale.date < first || sale.date > last) continue
    accumulate(buckets, startOfWeek(sale.date, weekStartsOn), sale)
  }

  return [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: formatDayLabel(key, options.locale),
    netSales: bucket.netSales,
    saleCount: bucket.saleCount,
  }))
}

/** Twelve points, January to December, for the annual bar chart (spec §25). */
export function monthlySeries(
  sales: readonly Sale[],
  year: number,
  options: SeriesOptions = {},
): SeriesPoint[] {
  const start = isoForYear(year)
  const buckets = new Map<string, Bucket>()
  const labels = new Map<string, string>()
  for (let month = 1; month <= 12; month += 1) {
    const key = `${start.slice(0, 4)}-${String(month).padStart(2, '0')}`
    buckets.set(key, emptyBucket())
    labels.set(key, formatMonthLabel(`${key}-01`, options.locale))
  }

  for (const sale of sales) {
    accumulate(buckets, monthKey(sale.date), sale)
  }

  return [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: labels.get(key) ?? key,
    netSales: bucket.netSales,
    saleCount: bucket.saleCount,
  }))
}

/**
 * Calendar-grid data for the month view (spec §22): every day of the month with
 * its net total and count, zero-filled, plus the weekday it falls on.
 */
export interface CalendarDay {
  date: IsoDate
  weekday: Weekday
  netSales: Cents
  saleCount: number
}

export function monthCalendar(sales: readonly Sale[], month: IsoDate): CalendarDay[] {
  const days = daysInRange(startOfMonth(month), endOfMonth(month))
  const buckets = new Map<string, Bucket>()
  for (const day of days) buckets.set(day, emptyBucket())
  for (const sale of sales) accumulate(buckets, sale.date, sale)

  return days.map((date) => {
    const bucket = buckets.get(date) ?? emptyBucket()
    return {
      date,
      weekday: weekdayOf(date),
      netSales: bucket.netSales,
      saleCount: bucket.saleCount,
    }
  })
}

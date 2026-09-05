/**
 * SalesTrack — local-date utilities.
 *
 * Every calendar date in this app is a 'YYYY-MM-DD' LOCAL string. Nothing in
 * here ever touches UTC: a sale entered at 23:59 belongs to that local day.
 *
 * DST rule: never do date arithmetic by adding 86_400_000ms — a day is 23 or 25
 * hours twice a year. All arithmetic builds a fresh Date from local Y/M/D parts
 * and lets the engine normalise overflow. Internally those Dates are anchored at
 * local NOON so a ±1h DST shift can never push the wall clock across midnight.
 */
import type { IsoDate, Settings, Weekday } from './types'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/

/** Calendar parts of an IsoDate. `month` is 1-12, not 0-11. */
export interface DateParts {
  year: number
  month: number
  day: number
}

/** Inclusive range of local calendar dates. */
export interface DateRange {
  from: IsoDate
  to: IsoDate
}

/** The slice of Settings the workday helpers need. */
export type WorkdaySettings = Pick<Settings, 'workdays' | 'excludedDates'>

/** Workday budget for a period: total, already underway, and still to come. */
export interface WorkdayCount {
  total: number
  elapsed: number
  remaining: number
}

// ---------------------------------------------------------------------------
// Parsing & construction
// ---------------------------------------------------------------------------

export function isValidIso(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false
  const m = ISO_RE.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= daysInMonth(year, month)
}

function assertIso(value: IsoDate): DateParts {
  const m = ISO_RE.exec(value)
  if (!m) throw new RangeError(`Invalid IsoDate: ${String(value)}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** Split an IsoDate into calendar parts. Throws on malformed input. */
export function isoParts(iso: IsoDate): DateParts {
  return assertIso(iso)
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function pad4(n: number): string {
  return String(Math.abs(n)).padStart(4, '0')
}

/**
 * Build a local Date at NOON from calendar parts, normalising overflow
 * (month 13 -> next January, day 32 -> next month). Noon keeps the calendar day
 * stable across every DST transition, including zones that shift at midnight.
 */
function localNoon(year: number, month: number, day: number): Date {
  const d = new Date(2000, 0, 1, 12, 0, 0, 0)
  d.setFullYear(year, month - 1, day)
  d.setHours(12, 0, 0, 0)
  return d
}

/** Number of days in a 1-12 month of a given year. Leap-year aware. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of this one.
  return localNoon(year, month + 1, 0).getDate()
}

/** Format a Date as a LOCAL 'YYYY-MM-DD' string. Never uses toISOString(). */
export function toIso(date: Date): IsoDate {
  return `${pad4(date.getFullYear())}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Parse an IsoDate into a local Date at the start of that day. */
export function fromIso(iso: IsoDate): Date {
  const { year, month, day } = assertIso(iso)
  const d = localNoon(year, month, day)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Today, in the device's local timezone. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now)
}

/** Local wall-clock time of `now` as 'HH:mm'. */
export function nowTime(now: Date = new Date()): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** -1 / 0 / 1. IsoDate sorts correctly as a plain string, which is the point. */
export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b
}

export function maxIso(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b
}

/** Inclusive on both ends. */
export function isWithin(date: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return date >= from && date <= to
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export function addDays(iso: IsoDate, days: number): IsoDate {
  const { year, month, day } = assertIso(iso)
  return toIso(localNoon(year, month, day + days))
}

/** Adds months, clamping the day (Jan 31 + 1 month -> Feb 28/29). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const { year, month, day } = assertIso(iso)
  const target = localNoon(year, month + months, 1)
  const targetYear = target.getFullYear()
  const targetMonth = target.getMonth() + 1
  const clamped = Math.min(day, daysInMonth(targetYear, targetMonth))
  return toIso(localNoon(targetYear, targetMonth, clamped))
}

export function startOfMonth(iso: IsoDate): IsoDate {
  const { year, month } = assertIso(iso)
  return `${pad4(year)}-${pad2(month)}-01`
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const { year, month } = assertIso(iso)
  return `${pad4(year)}-${pad2(month)}-${pad2(daysInMonth(year, month))}`
}

export function startOfYear(iso: IsoDate): IsoDate {
  return `${pad4(assertIso(iso).year)}-01-01`
}

export function endOfYear(iso: IsoDate): IsoDate {
  return `${pad4(assertIso(iso).year)}-12-31`
}

export function monthRange(iso: IsoDate): DateRange {
  return { from: startOfMonth(iso), to: endOfMonth(iso) }
}

export function yearRange(iso: IsoDate): DateRange {
  return { from: startOfYear(iso), to: endOfYear(iso) }
}

/** 'YYYY-MM' bucket key for month grouping. */
export function monthKey(iso: IsoDate): string {
  const { year, month } = assertIso(iso)
  return `${pad4(year)}-${pad2(month)}`
}

/** First day of a 'YYYY-MM' key. */
export function monthKeyToIso(key: string): IsoDate {
  const m = MONTH_KEY_RE.exec(key)
  if (!m) throw new RangeError(`Invalid month key: ${String(key)}`)
  return `${m[1]}-${m[2]}-01`
}

export function yearOf(iso: IsoDate): number {
  return assertIso(iso).year
}

/** First day of a calendar year. */
export function isoForYear(year: number): IsoDate {
  return `${pad4(year)}-01-01`
}

/** 0 = Sunday … 6 = Saturday, matching Date#getDay(). */
export function weekdayOf(iso: IsoDate): Weekday {
  const { year, month, day } = assertIso(iso)
  return localNoon(year, month, day).getDay() as Weekday
}

/** Start of the week containing `iso`, honouring the configured first day. */
export function startOfWeek(iso: IsoDate, weekStartsOn: Weekday = 1): IsoDate {
  const delta = (weekdayOf(iso) - weekStartsOn + 7) % 7
  return addDays(iso, -delta)
}

export function endOfWeek(iso: IsoDate, weekStartsOn: Weekday = 1): IsoDate {
  return addDays(startOfWeek(iso, weekStartsOn), 6)
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = assertIso(from)
  const b = assertIso(to)
  // Both anchors sit at local noon, so a DST shift moves them together and the
  // quotient still lands on an integer after rounding.
  const ms =
    localNoon(b.year, b.month, b.day).getTime() - localNoon(a.year, a.month, a.day).getTime()
  return Math.round(ms / 86_400_000)
}

/** Every date from `from` to `to`, inclusive. Empty when `from` > `to`. */
export function daysInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  if (compareIso(from, to) > 0) return []
  const start = assertIso(from)
  const last = assertIso(to)
  const out: IsoDate[] = []
  const cursor = localNoon(start.year, start.month, start.day)
  const end = localNoon(last.year, last.month, last.day)
  while (cursor.getTime() <= end.getTime()) {
    out.push(toIso(cursor))
    cursor.setDate(cursor.getDate() + 1)
    // Re-anchor to noon: setDate keeps the wall clock, which a DST shift moves.
    cursor.setHours(12, 0, 0, 0)
  }
  return out
}

// ---------------------------------------------------------------------------
// Workdays — pace runs on configured working days, not calendar days (§66-68)
// ---------------------------------------------------------------------------

export function isWorkday(
  date: IsoDate,
  workdays: readonly Weekday[],
  excludedDates: readonly IsoDate[] | ReadonlySet<IsoDate> = [],
): boolean {
  const excluded =
    excludedDates instanceof Set
      ? excludedDates.has(date)
      : (excludedDates as readonly IsoDate[]).includes(date)
  if (excluded) return false
  return workdays.includes(weekdayOf(date))
}

/** Count of configured workdays between two dates, inclusive. */
export function countWorkdays(from: IsoDate, to: IsoDate, settings: WorkdaySettings): number {
  if (compareIso(from, to) > 0) return 0
  if (settings.workdays.length === 0) return 0
  const excluded = new Set(settings.excludedDates)
  let count = 0
  for (const day of daysInRange(from, to)) {
    if (!excluded.has(day) && settings.workdays.includes(weekdayOf(day))) count += 1
  }
  return count
}

/**
 * Workday budget for an arbitrary period.
 *
 * `elapsed` counts the day in progress: a workday that has started is spent, so
 * on the last workday of a month `elapsed === total` and the expected figure
 * reaches 100% of goal. `remaining` is therefore the workdays strictly after
 * `asOf`, which is what "required per workday" divides by (spec §23, §67).
 */
export function workdaysFor(
  range: DateRange,
  asOf: IsoDate,
  settings: WorkdaySettings,
): WorkdayCount {
  const total = countWorkdays(range.from, range.to, settings)
  let elapsed = 0
  if (compareIso(asOf, range.from) >= 0) {
    elapsed = countWorkdays(range.from, minIso(asOf, range.to), settings)
  }
  return { total, elapsed, remaining: Math.max(0, total - elapsed) }
}

/** Workday budget for the month containing `month`, measured as of `asOf`. */
export function monthWorkdays(
  month: IsoDate,
  settings: WorkdaySettings,
  asOf: IsoDate = month,
): WorkdayCount {
  return workdaysFor(monthRange(month), asOf, settings)
}

/** Workday budget for the year containing `year`, measured as of `asOf`. */
export function yearWorkdays(
  year: IsoDate,
  settings: WorkdaySettings,
  asOf: IsoDate = year,
): WorkdayCount {
  return workdaysFor(yearRange(year), asOf, settings)
}

export function workdaysInMonth(month: IsoDate, settings: WorkdaySettings): number {
  return monthWorkdays(month, settings).total
}

export function workdaysInYear(year: IsoDate, settings: WorkdaySettings): number {
  return yearWorkdays(year, settings).total
}

export function workdaysElapsedInMonth(
  asOf: IsoDate,
  settings: WorkdaySettings,
  month: IsoDate = asOf,
): number {
  return monthWorkdays(month, settings, asOf).elapsed
}

export function workdaysRemainingInMonth(
  asOf: IsoDate,
  settings: WorkdaySettings,
  month: IsoDate = asOf,
): number {
  return monthWorkdays(month, settings, asOf).remaining
}

export function workdaysElapsedInYear(
  asOf: IsoDate,
  settings: WorkdaySettings,
  year: IsoDate = asOf,
): number {
  return yearWorkdays(year, settings, asOf).elapsed
}

export function workdaysRemainingInYear(
  asOf: IsoDate,
  settings: WorkdaySettings,
  year: IsoDate = asOf,
): number {
  return yearWorkdays(year, settings, asOf).remaining
}

/** Previous configured workday strictly before `iso`, or null if none within `limit` days. */
export function previousWorkday(
  iso: IsoDate,
  settings: WorkdaySettings,
  limit = 400,
): IsoDate | null {
  if (settings.workdays.length === 0) return null
  const excluded = new Set(settings.excludedDates)
  let cursor = iso
  for (let i = 0; i < limit; i += 1) {
    cursor = addDays(cursor, -1)
    if (!excluded.has(cursor) && settings.workdays.includes(weekdayOf(cursor))) return cursor
  }
  return null
}

// ---------------------------------------------------------------------------
// Labels — axis-sized only; full display formatting lives in format.ts
// ---------------------------------------------------------------------------

/** Compact day label for chart axes and calendar cells, e.g. 'Sep 4'. */
export function formatDayLabel(iso: IsoDate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(fromIso(iso))
}

/** Short month label for the annual bar chart, e.g. 'Jan' (spec §25). */
export function formatMonthLabel(iso: IsoDate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(fromIso(iso))
}

/** Short weekday label for calendar headers, e.g. 'Mon'. */
export function formatWeekdayLabel(iso: IsoDate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(fromIso(iso))
}

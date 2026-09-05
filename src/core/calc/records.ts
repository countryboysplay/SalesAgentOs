/**
 * Personal records and streaks (spec §29, §30).
 *
 * Streak rule: only configured workdays are examined. A Friday hit followed by a
 * quiet Saturday and Sunday continues on Monday — non-workdays are skipped
 * entirely and are never misses (spec §77 Working Day Test).
 */
import { addDays, todayIso, weekdayOf } from '../date'
import type { DateRange, WorkdaySettings } from '../date'
import { averageCents, percentOf } from '../money'
import { goalAmountFor } from './goals'
import { countByDay, effectiveAmount, isActive, netByDay, netByMonth, totalsFor } from './totals'
import type { SaleSelector } from './totals'
import type { Cents, Goal, IsoDate, PersonalRecords, Sale } from '../types'

/** Hard stop for the streak walk: ~20 years of skipped days. */
const MAX_STREAK_LOOKBACK = 366 * 20

export function personalRecords(
  sales: readonly Sale[],
  goals: readonly Goal[],
  settings: WorkdaySettings,
  asOf: IsoDate = todayIso(),
): PersonalRecords {
  return {
    bestDay: bestDay(sales),
    bestMonth: bestMonth(sales),
    largestSale: largestSale(sales),
    mostSalesInDay: mostSalesInDay(sales),
    goalStreak: goalStreak(sales, goals, settings, asOf),
  }
}

/** Highest net day. Ties go to the earliest date — the record was set first. */
export function bestDay(sales: readonly Sale[]): PersonalRecords['bestDay'] {
  let best: { date: IsoDate; amount: Cents } | null = null
  for (const [date, amount] of netByDay(sales)) {
    if (amount <= 0) continue
    if (best === null || amount > best.amount || (amount === best.amount && date < best.date)) {
      best = { date, amount }
    }
  }
  return best
}

export function bestMonth(sales: readonly Sale[]): PersonalRecords['bestMonth'] {
  let best: { month: string; amount: Cents } | null = null
  for (const [month, amount] of netByMonth(sales)) {
    if (amount <= 0) continue
    if (best === null || amount > best.amount || (amount === best.amount && month < best.month)) {
      best = { month, amount }
    }
  }
  return best
}

/** Largest single sale, measured on the amount that still stands. */
export function largestSale(sales: readonly Sale[]): PersonalRecords['largestSale'] {
  let best: { id: string; date: IsoDate; amount: Cents } | null = null
  for (const sale of sales) {
    if (!isActive(sale)) continue
    const amount = effectiveAmount(sale)
    if (amount <= 0) continue
    if (best === null || amount > best.amount || (amount === best.amount && sale.date < best.date)) {
      best = { id: sale.id, date: sale.date, amount }
    }
  }
  return best
}

export function mostSalesInDay(sales: readonly Sale[]): PersonalRecords['mostSalesInDay'] {
  let best: { date: IsoDate; count: number } | null = null
  for (const [date, count] of countByDay(sales)) {
    if (count <= 0) continue
    if (best === null || count > best.count || (count === best.count && date < best.date)) {
      best = { date, count }
    }
  }
  return best
}

/**
 * Consecutive configured workdays that hit the daily goal in force on that day,
 * walking backwards from `asOf`.
 *
 * Three rules make this behave the way an agent expects:
 *  - non-workdays (weekends, excluded holidays) are skipped, never misses;
 *  - a workday with no daily goal in force is also skipped — the app cannot
 *    fail you against a goal that did not exist;
 *  - `asOf` itself is still in progress, so missing today's goal at 9am does not
 *    wipe out yesterday's streak. Any earlier workday that misses ends it.
 */
export function goalStreak(
  sales: readonly Sale[],
  goals: readonly Goal[],
  settings: WorkdaySettings,
  asOf: IsoDate = todayIso(),
): number {
  if (settings.workdays.length === 0) return 0

  let earliest: IsoDate | null = null
  for (const sale of sales) {
    if (earliest === null || sale.date < earliest) earliest = sale.date
  }
  if (earliest === null) return 0

  const netPerDay = netByDay(sales)
  const excluded = new Set(settings.excludedDates)
  let streak = 0
  let cursor = asOf

  for (let i = 0; i < MAX_STREAK_LOOKBACK && cursor >= earliest; i += 1) {
    const working = !excluded.has(cursor) && settings.workdays.includes(weekdayOf(cursor))
    if (working) {
      const goal = goalAmountFor('daily', cursor, goals)
      if (goal !== null && goal > 0) {
        const net = netPerDay.get(cursor) ?? 0
        if (net >= goal) {
          streak += 1
        } else if (cursor !== asOf) {
          break // an earlier workday that missed ends the streak
        }
      }
    }
    cursor = addDays(cursor, -1)
  }

  return streak
}

export interface GoalAttainment {
  /** Workdays in range that had a daily goal in force. */
  workdays: number
  /** Of those, how many reached it. */
  hits: number
  /** hits / workdays, 0 when there is nothing to measure. */
  rate: number
}

/** Goal attainment rate over a range (spec §27). */
export function goalAttainment(
  sales: readonly Sale[],
  goals: readonly Goal[],
  settings: WorkdaySettings,
  range: DateRange,
): GoalAttainment {
  const netPerDay = netByDay(sales)
  const excluded = new Set(settings.excludedDates)
  let workdays = 0
  let hits = 0
  let cursor = range.from
  while (cursor <= range.to) {
    if (!excluded.has(cursor) && settings.workdays.includes(weekdayOf(cursor))) {
      const goal = goalAmountFor('daily', cursor, goals)
      if (goal !== null && goal > 0) {
        workdays += 1
        if ((netPerDay.get(cursor) ?? 0) >= goal) hits += 1
      }
    }
    cursor = addDays(cursor, 1)
  }
  return { workdays, hits, rate: percentOf(hits, workdays) }
}

/** Average net sales per configured working day in a range (spec §27). */
export function averagePerWorkday(
  sales: readonly Sale[],
  settings: WorkdaySettings,
  range: DateRange,
): Cents {
  const excluded = new Set(settings.excludedDates)
  let workdays = 0
  let cursor = range.from
  while (cursor <= range.to) {
    if (!excluded.has(cursor) && settings.workdays.includes(weekdayOf(cursor))) workdays += 1
    cursor = addDays(cursor, 1)
  }
  const selector: SaleSelector = range
  return averageCents(totalsFor(sales, selector).netSales, workdays)
}

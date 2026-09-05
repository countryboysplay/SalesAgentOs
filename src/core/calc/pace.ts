/**
 * Pace — am I ahead or behind? (spec §12, §52, §66-68)
 *
 * Expected = goal x (workdays elapsed / workdays total), never calendar days.
 * A workday that has started counts as elapsed, so the expected figure reaches
 * 100% of goal on the final workday of the period, and "required per workday"
 * divides the shortfall across the workdays still to come (spec §23, §67).
 *
 * For monthly and annual pace, "workdays total/elapsed" are counted from the
 * later of the period start or the governing goal's own `effectiveFrom` (see
 * `goalWorkdayRange`) — a goal created partway through a period with no prior
 * goal of its type cannot be "behind" on workdays that predate its existence.
 */
import { averageCents, percentOf } from '../money'
import {
  addMonths,
  compareIso,
  isWorkday,
  isoParts,
  maxIso,
  monthRange,
  todayIso,
  workdaysFor,
  yearRange,
} from '../date'
import type { DateRange, WorkdaySettings } from '../date'
import { goalAmountFor, goalForPeriod } from './goals'
import { totalsFor, totalsForDay } from './totals'
import type { Cents, Goal, IsoDate, PaceResult, Sale } from '../types'

/** Tolerance band around expected: 2%, but never less than $1 (spec §52). */
const TOLERANCE_FRACTION = 0.02
const MIN_TOLERANCE: Cents = 100

export interface PaceInput {
  goal: Cents | null
  actual: Cents
  workdaysTotal: number
  workdaysElapsed: number
  workdaysRemaining: number
}

export const NO_GOAL_PACE: PaceResult = {
  status: 'no-goal',
  goal: null,
  actual: 0,
  expected: 0,
  difference: 0,
  progress: 0,
  remaining: 0,
  workdaysTotal: 0,
  workdaysElapsed: 0,
  workdaysRemaining: 0,
  requiredPerWorkday: null,
}

/** Shared arithmetic behind daily, monthly and annual pace. */
export function computePace(input: PaceInput): PaceResult {
  const { goal, actual, workdaysTotal, workdaysElapsed, workdaysRemaining } = input

  if (goal === null || goal <= 0) {
    // No goal in force: report the raw figure without inventing a comparison.
    return {
      ...NO_GOAL_PACE,
      actual,
      workdaysTotal,
      workdaysElapsed,
      workdaysRemaining,
    }
  }

  const expected =
    workdaysTotal > 0 ? averageCents(goal * Math.min(workdaysElapsed, workdaysTotal), workdaysTotal) : 0
  const difference = actual - expected
  const progress = percentOf(actual, goal)
  const remaining = Math.max(0, goal - actual)
  const requiredPerWorkday = workdaysRemaining > 0 ? averageCents(remaining, workdaysRemaining) : null

  const tolerance = Math.max(MIN_TOLERANCE, Math.round(expected * TOLERANCE_FRACTION))
  let status: PaceResult['status']
  if (progress >= 1) status = 'goal-reached'
  else if (difference > tolerance) status = 'ahead'
  else if (difference < -tolerance) status = 'behind'
  else status = 'on-track'

  return {
    status,
    goal,
    actual,
    expected,
    difference,
    progress,
    remaining,
    workdaysTotal,
    workdaysElapsed,
    workdaysRemaining,
    requiredPerWorkday,
  }
}

/**
 * The workday window a period-goal is actually measured against.
 *
 * A goal resolved by `goalForPeriod` may be the row that governed the period
 * all along (`effectiveFrom` at or before `range.from`) or the prospective
 * fallback for a goal that did not exist until partway through the period
 * (spec §32, §69 — see `goalForPeriod`'s doc comment). Only the second case
 * needs adjusting: a goal cannot be behind on workdays that predate its own
 * creation, so the window starts at `effectiveFrom` instead of the period
 * start. When the goal already covered the period start, `maxIso` is a no-op
 * and the window is the whole period, exactly as before — including a goal
 * deliberately backdated to the period start ("apply from the start of this
 * month"), which must still measure from day one.
 */
function goalWorkdayRange(range: DateRange, goal: Goal | null): DateRange {
  if (goal === null) return range
  return { from: maxIso(range.from, goal.effectiveFrom), to: range.to }
}

/**
 * Today against the daily goal.
 *
 * A day is a single workday: once it has started the whole daily goal is
 * expected, so `difference` is the "+$242 Above Goal" figure from spec §10. On a
 * non-working day nothing is expected — the agent is never behind on a day off.
 */
export function dailyPace(
  sales: readonly Sale[],
  goals: readonly Goal[],
  settings: WorkdaySettings,
  date: IsoDate = todayIso(),
): PaceResult {
  const working = isWorkday(date, settings.workdays, settings.excludedDates)
  return computePace({
    goal: goalAmountFor('daily', date, goals),
    actual: totalsForDay(sales, date).netSales,
    workdaysTotal: working ? 1 : 0,
    workdaysElapsed: working ? 1 : 0,
    workdaysRemaining: 0,
  })
}

/**
 * The month containing `month`, measured as of `asOf`.
 * Reviewing a past month leaves `asOf` after its end, so every workday counts as
 * elapsed and the comparison is against the whole month's goal.
 */
export function monthlyPace(
  sales: readonly Sale[],
  goals: readonly Goal[],
  settings: WorkdaySettings,
  month: IsoDate = todayIso(),
  asOf: IsoDate = todayIso(),
): PaceResult {
  const range = monthRange(month)
  // Resolved against the month itself, never against today, so September's
  // revision cannot rewrite January's target (spec §32, §69). Period-aware so
  // that a goal first created mid-month still governs that month.
  const goal = goalForPeriod('monthly', range.from, range.to, goals)
  const workdays = workdaysFor(goalWorkdayRange(range, goal), asOf, settings)
  return computePace({
    goal: goal ? goal.amount : null,
    actual: totalsFor(sales, range).netSales,
    workdaysTotal: workdays.total,
    workdaysElapsed: workdays.elapsed,
    workdaysRemaining: workdays.remaining,
  })
}

/** The year containing `year`, measured as of `asOf`. */
export function annualPace(
  sales: readonly Sale[],
  goals: readonly Goal[],
  settings: WorkdaySettings,
  year: IsoDate = todayIso(),
  asOf: IsoDate = todayIso(),
): PaceResult {
  const range = yearRange(year)
  const goal = goalForPeriod('annual', range.from, range.to, goals)
  const workdays = workdaysFor(goalWorkdayRange(range, goal), asOf, settings)
  return computePace({
    goal: goal ? goal.amount : null,
    actual: totalsFor(sales, range).netSales,
    workdaysTotal: workdays.total,
    workdaysElapsed: workdays.elapsed,
    workdaysRemaining: workdays.remaining,
  })
}

/** Whole calendar months left in the year, counting the one in progress (spec §68). */
export function monthsRemainingInYear(asOf: IsoDate, year: IsoDate = asOf): number {
  const range = yearRange(year)
  if (compareIso(asOf, range.from) < 0) return 12
  if (compareIso(asOf, range.to) > 0) return 0
  return 12 - isoParts(asOf).month + 1
}

/**
 * Required average monthly sales for the rest of the year (spec §68).
 * null once the year is over.
 */
export function requiredPerRemainingMonth(
  pace: PaceResult,
  asOf: IsoDate,
  year: IsoDate = asOf,
): Cents | null {
  if (pace.goal === null) return null
  const months = monthsRemainingInYear(asOf, year)
  if (months <= 0) return null
  return averageCents(pace.remaining, months)
}

/** First day of the month `offset` months from `date`. Handy for month navigation. */
export function shiftMonth(date: IsoDate, offset: number): IsoDate {
  return monthRange(addMonths(date, offset)).from
}

/**
 * Goal resolution — which goal was in force on a given day (spec §32, §69).
 *
 * Goals are versioned rows, never edited in place. Changing September's monthly
 * goal must leave January's attainment alone, so every read is resolved against
 * the date being reported on rather than against "current settings".
 */
import type { Cents, Goal, GoalType, IsoDate } from '../types'

/**
 * The goal row governing `date`, or null when none applies.
 *
 * Resolution order:
 *  1. rows of this type whose window contains `date`
 *  2. latest `effectiveFrom` wins (a newer version supersedes an older one)
 *  3. ties break on `createdAt`, then `id`, so the result is stable
 *
 * `enabled` is checked AFTER the winner is picked, not before: a disabled row
 * means "the goal is switched off from this date", so it must shadow the older
 * row it replaced rather than letting that row resurface.
 */
export function goalFor(type: GoalType, date: IsoDate, goals: readonly Goal[]): Goal | null {
  let best: Goal | null = null
  for (const goal of goals) {
    if (goal.type !== type) continue
    if (goal.effectiveFrom > date) continue
    if (goal.effectiveTo !== null && goal.effectiveTo < date) continue
    if (best === null || isPreferred(goal, best)) best = goal
  }
  if (best === null || !best.enabled) return null
  return best
}

function isPreferred(candidate: Goal, incumbent: Goal): boolean {
  if (candidate.effectiveFrom !== incumbent.effectiveFrom) {
    return candidate.effectiveFrom > incumbent.effectiveFrom
  }
  if (candidate.createdAt !== incumbent.createdAt) return candidate.createdAt > incumbent.createdAt
  return candidate.id > incumbent.id
}

/** Convenience: the amount in force, or null when no goal applies. */
export function goalAmountFor(
  type: GoalType,
  date: IsoDate,
  goals: readonly Goal[],
): Cents | null {
  const goal = goalFor(type, date, goals)
  return goal ? goal.amount : null
}

/**
 * The goal governing a whole reporting period (a month, a year).
 *
 * Resolving at the period's first day alone is not enough. Goals are stamped
 * `effectiveFrom = today` when they are created, so a monthly goal set on the
 * 4th does not cover the 1st — and the month it was created in would report
 * "no goal" for the rest of that month, with an annual goal staying invisible
 * until the following January. That is the app's headline question left
 * unanswerable (§78).
 *
 * So: prefer the row in force on the first day, which keeps a mid-period
 * *change* from rewriting the period it was made in (§32, §69). Only when no
 * row covers the start do we fall back to the earliest row overlapping the
 * period — the case where the goal did not exist yet.
 */
export function goalForPeriod(
  type: GoalType,
  from: IsoDate,
  to: IsoDate,
  goals: readonly Goal[],
): Goal | null {
  const atStart = goalFor(type, from, goals)
  if (atStart !== null) return atStart

  // Nothing covered the period start. Take the first row that begins inside it.
  let earliest: Goal | null = null
  for (const goal of goals) {
    if (goal.type !== type) continue
    if (goal.effectiveFrom < from || goal.effectiveFrom > to) continue
    if (goal.effectiveTo !== null && goal.effectiveTo < from) continue
    if (earliest === null || isPreferred(earliest, goal)) earliest = goal
  }
  if (earliest === null || !earliest.enabled) return null
  return earliest
}

/** Convenience: the period's goal amount, or null when none applies. */
export function goalAmountForPeriod(
  type: GoalType,
  from: IsoDate,
  to: IsoDate,
  goals: readonly Goal[],
): Cents | null {
  const goal = goalForPeriod(type, from, to, goals)
  return goal ? goal.amount : null
}

/** True when a goal of this type is in force on `date`. */
export function hasGoal(type: GoalType, date: IsoDate, goals: readonly Goal[]): boolean {
  return goalFor(type, date, goals) !== null
}

/** History for one goal type, newest window first. Settings > Goals renders this. */
export function goalHistory(type: GoalType, goals: readonly Goal[]): Goal[] {
  return goals
    .filter((goal) => goal.type === type)
    .sort((a, b) => (isPreferred(a, b) ? -1 : 1))
}

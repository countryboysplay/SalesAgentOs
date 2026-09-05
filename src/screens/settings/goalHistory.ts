/**
 * Settings > Goals — turning versioned goal rows into sentences.
 *
 * Goals are stored as intervals (`effectiveFrom` / `effectiveTo`) precisely so
 * that changing one never rewrites the past (§32, §69). That storage shape is
 * correct but unreadable, so this module renders it the way the spec writes it:
 *
 *   January – August 2026   $9,000/month
 *   September 2026 onward   $10,000/month
 *
 * Nothing here mutates a goal. The repository owns the interval maths; this
 * only describes what the repository already decided.
 */
import { goalFor, goalHistory as resolveGoalHistory } from '@/core/calc'
import { addDays, daysInMonth, isoParts, monthKey } from '@/core/date'
import { formatCurrency, formatDate, formatMonthKey, type FormatSettings } from '@/core/format'
import type { Goal, GoalType, IsoDate } from '@/core/types'

/** How a goal of this type is spoken about: "$10,000/month". */
export function goalUnitSuffix(type: GoalType): string {
  return type === 'daily' ? '/day' : type === 'monthly' ? '/month' : '/year'
}

export function goalTypeLabel(type: GoalType): string {
  return type === 'daily' ? 'Daily Goal' : type === 'monthly' ? 'Monthly Goal' : 'Annual Goal'
}

/** The period a goal of this type is measured over, in prose. */
export function goalPeriodNoun(type: GoalType): string {
  return type === 'daily' ? 'days' : type === 'monthly' ? 'months' : 'years'
}

function isFirstOfMonth(date: IsoDate): boolean {
  return isoParts(date).day === 1
}

function isLastOfMonth(date: IsoDate): boolean {
  const { year, month, day } = isoParts(date)
  return day === daysInMonth(year, month)
}

/**
 * A human label for one goal interval.
 *
 * Monthly and annual goals whose interval happens to align to whole calendar
 * months are described in months ("January – August 2026"), because that is the
 * unit the goal is actually measured in. Anything else falls back to dates, so
 * a mid-month change is never rounded away into a misleading month name.
 */
export function goalPeriodLabel(goal: Goal, type: GoalType, fmt: FormatSettings): string {
  const { effectiveFrom: from, effectiveTo: to } = goal

  const monthAligned =
    type !== 'daily' && isFirstOfMonth(from) && (to === null || isLastOfMonth(to))

  if (monthAligned) {
    const fromLabel = formatMonthKey(monthKey(from), fmt)
    if (to === null) return `${fromLabel} onward`
    if (monthKey(from) === monthKey(to)) return fromLabel
    return `${fromLabel} – ${formatMonthKey(monthKey(to), fmt)}`
  }

  if (to === null) return `${formatDate(from, fmt, 'long')} onward`
  return `${formatDate(from, fmt, 'medium')} – ${formatDate(to, fmt, 'medium')}`
}

export interface GoalHistoryEntry {
  key: string
  period: string
  amount: string
  enabled: boolean
  /** True for the interval covering `asOf`. */
  current: boolean
}

function covers(goal: Goal, date: IsoDate): boolean {
  return goal.effectiveFrom <= date && (goal.effectiveTo === null || goal.effectiveTo >= date)
}

/**
 * The one row governing `date` — the same row every other screen is measured
 * against, resolved by `@/core/calc` and not by a second opinion.
 *
 * `goalFor` is the authority and is used first. It deliberately answers null
 * when the winning row is DISABLED, because "no goal from this date" is what a
 * disabled row means. That row is still the window the timeline is sitting in
 * and still has to be named, so the fallback walks the shared history, which is
 * already ordered by the same rule (latest `effectiveFrom` wins, ties on
 * `createdAt` then `id`) and takes the first row that covers the date.
 *
 * Both branches therefore agree with the rest of the app. Exactly one row can
 * ever come back, which is why two rows could no longer both claim "in force
 * now" the way the old bare-interval test allowed.
 */
export function goalCoveringDate(
  type: GoalType,
  rows: readonly Goal[],
  date: IsoDate,
): Goal | null {
  const inForce = goalFor(type, date, rows)
  if (inForce !== null) return inForce
  return resolveGoalHistory(type, rows).find((goal) => covers(goal, date)) ?? null
}

/**
 * Every interval ever recorded for a goal type, newest first.
 *
 * Ordering and "which one is in force" both come from `@/core/calc`; this
 * function only turns the result into sentences.
 *
 * Disabled rows are kept and shown as "No goal" rather than hidden: a stretch
 * with no target is part of the history a past month was measured against, and
 * silently dropping it would make the timeline lie.
 */
export function goalHistory(
  rows: readonly Goal[],
  type: GoalType,
  asOf: IsoDate,
  fmt: FormatSettings,
): GoalHistoryEntry[] {
  const currentId = goalCoveringDate(type, rows, asOf)?.id ?? null

  return resolveGoalHistory(type, rows).map((goal) => ({
    key: goal.id,
    period: goalPeriodLabel(goal, type, fmt),
    amount: goal.enabled
      ? `${formatCurrency(goal.amount, fmt)}${goalUnitSuffix(type)}`
      : 'No goal',
    enabled: goal.enabled,
    current: goal.id === currentId,
  }))
}

/**
 * The two sentences shown before a goal edit is committed: what the new rule
 * will be, and what the old one keeps covering. This is the whole point of
 * prospective versioning being visible rather than surprising.
 */
export interface ProspectivePreview {
  /** "September 4, 2026 onward: $10,000/month" */
  forward: string
  /** "September 3, 2026 and earlier keep $9,000/month" — null when nothing precedes. */
  history: string | null
}

export function prospectivePreview(
  type: GoalType,
  nextAmount: number | null,
  nextEnabled: boolean,
  effectiveFrom: IsoDate,
  previous: Goal | null,
  fmt: FormatSettings,
): ProspectivePreview {
  const suffix = goalUnitSuffix(type)
  const forwardValue =
    !nextEnabled || nextAmount === null
      ? 'no goal'
      : `${formatCurrency(nextAmount, fmt)}${suffix}`

  const forward = `${formatDate(effectiveFrom, fmt, 'long')} onward: ${forwardValue}`

  if (!previous) return { forward, history: null }

  const previousValue = previous.enabled
    ? `${formatCurrency(previous.amount, fmt)}${suffix}`
    : 'no goal'

  return {
    forward,
    history: `${formatDate(addDays(effectiveFrom, -1), fmt, 'long')} and earlier keep ${previousValue}`,
  }
}

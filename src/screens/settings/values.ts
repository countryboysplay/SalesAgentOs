/**
 * Settings — typed text in, integer values out.
 *
 * Split out of parts.tsx so these rules can be tested without React, and so
 * there is exactly ONE place that decides what a typed amount or rate means.
 *
 * The reason that matters: a second, float-based percent parser used to live
 * here (`Math.round(Number(cleaned) * 100)`) while onboarding routed through
 * `parseAmountToCents`. The same keystrokes produced different stored values —
 * '1.005' was 100bp in Settings and 101bp in onboarding — because binary
 * floating point rounds '1.005' down and decimal-digit parsing rounds it up.
 * Percent and cents share a scale (5% -> 500bp, $5 -> 500c), so the core money
 * parser IS the rate parser, and the divergence cannot come back.
 */
import { parseAmountToCents } from '@/core/money'
import type { BasisPoints, Cents } from '@/core/types'

/* ------------------------------------------------------------------ money */

/**
 * Dollars typed by a human -> integer cents. Wraps parseAmountToCents so every
 * money field in Settings rejects the same inputs, and refuses negatives —
 * a goal or a rate is never below zero.
 */
export function parseMoneyInput(input: string): Cents | null {
  const cents = parseAmountToCents(input)
  if (cents === null || cents < 0) return null
  return cents
}

/** Integer cents -> the string a money field shows. '10000' -> '100', not '100.00'. */
export function centsToInput(cents: Cents): string {
  if (!Number.isFinite(cents)) return ''
  const whole = Math.trunc(cents / 100)
  const remainder = Math.abs(cents % 100)
  return remainder === 0 ? String(whole) : `${whole}.${String(remainder).padStart(2, '0')}`
}

/* -------------------------------------------------------------- percentages */

/**
 * The ceiling on any commission rate, in basis points. 100%.
 *
 * A rate above the sale itself is a typo rather than an intent. The bound is
 * exported so the same number can be quoted in the copy that explains a
 * rejection, and so a value that arrived from somewhere with looser bounds —
 * a restored backup, an older build — can be RECOGNISED as out of range and
 * described, instead of silently failing to parse.
 */
export const MAX_RATE_BASIS_POINTS = 10_000

export type PercentRejection = 'empty' | 'not-a-number' | 'negative' | 'above-max'

export type PercentResult =
  | { ok: true; basisPoints: BasisPoints }
  | { ok: false; reason: PercentRejection }

/**
 * A typed percentage -> basis points, with the reason when it will not do.
 *
 * Every caller gets the reason because a rejected value must always be
 * explained: a field that quietly refuses to save, with the offending number
 * still sitting in it, is a dead end the user cannot reason their way out of.
 */
export function parsePercent(input: string): PercentResult {
  const cleaned = input.replace(/%/g, '').trim()
  if (cleaned === '') return { ok: false, reason: 'empty' }

  const parsed = parseAmountToCents(cleaned)
  if (parsed === null) return { ok: false, reason: 'not-a-number' }
  if (parsed < 0) return { ok: false, reason: 'negative' }
  if (parsed > MAX_RATE_BASIS_POINTS) return { ok: false, reason: 'above-max' }
  return { ok: true, basisPoints: parsed }
}

/** parsePercent for callers that only need the value. '5' -> 500, '3.25' -> 325. */
export function parsePercentInput(input: string): BasisPoints | null {
  const result = parsePercent(input)
  return result.ok ? result.basisPoints : null
}

/**
 * Why a rate was refused, in a sentence the user can act on.
 *
 * `blankAllowed` is for the per-category field, where an empty box means
 * "use the default" rather than a mistake.
 */
export function percentRejectionMessage(
  reason: PercentRejection,
  options: { blankAllowed?: boolean } = {},
): string {
  const max = basisPointsToInput(MAX_RATE_BASIS_POINTS)
  const orBlank = options.blankAllowed ? ', or leave it blank to use the default' : ''

  switch (reason) {
    case 'empty':
      return options.blankAllowed
        ? `Enter a rate between 0 and ${max}%, or leave it blank to use the default.`
        : `Enter a rate between 0 and ${max}%, for example 5.`
    case 'not-a-number':
      return `That is not a number. Enter a rate like 5 or 3.25${orBlank}.`
    case 'negative':
      return `A rate cannot be below zero. Enter a rate between 0 and ${max}%${orBlank}.`
    case 'above-max':
      return `${max}% is the highest rate SalesTrack accepts. Enter a rate between 0 and ${max}%${orBlank}.`
  }
}

/**
 * Basis points -> the string a percent field shows. 500 -> '5', 325 -> '3.25'.
 *
 * Integer arithmetic, same as `centsToInput`: a rate is basis points on the
 * cent scale, so dividing by 100 in floating point here would be the same
 * mistake the parser above exists to prevent.
 */
export function basisPointsToInput(basisPoints: BasisPoints): string {
  if (!Number.isFinite(basisPoints)) return ''
  return centsToInput(Math.round(basisPoints))
}

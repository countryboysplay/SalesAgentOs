/**
 * SalesTrack — integer-cent arithmetic.
 *
 * Money never touches a float in state. Everything here takes and returns
 * integer cents, and every division rounds deterministically so the same inputs
 * always produce the same cent — no drift between the dashboard, the ledger and
 * the CSV export.
 */
import type { BasisPoints, Cents } from './types'

/**
 * Divide with half-up rounding on the magnitude (half away from zero).
 * Kept as integer maths so 25.5 cents can never land on 25 in one place and 26
 * in another because of binary floating point.
 */
function divideRoundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0
  const sign = numerator < 0 !== denominator < 0 ? -1 : 1
  const n = Math.abs(numerator)
  const d = Math.abs(denominator)
  const q = Math.floor(n / d)
  const remainder = n - q * d
  return sign * (remainder * 2 >= d ? q + 1 : q)
}

/** Sum of cents. Non-finite entries are ignored rather than poisoning the total. */
export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0
  for (const value of values) {
    if (Number.isFinite(value)) total += value
  }
  return total
}

/**
 * Commission in cents for an amount at a basis-point rate.
 * 5% is 500bp, so $500.00 (50000c) at 500bp = 2500c = $25.00 (spec §77).
 */
export function commissionFor(amountCents: Cents, basisPoints: BasisPoints): Cents {
  if (!Number.isFinite(amountCents) || !Number.isFinite(basisPoints)) return 0
  return divideRoundHalfUp(Math.round(amountCents) * Math.round(basisPoints), 10_000)
}

/** Average of a cent total over a count. 0 when the count is 0 (spec §65). */
export function averageCents(total: Cents, count: number): Cents {
  if (!Number.isFinite(count) || count <= 0) return 0
  return divideRoundHalfUp(total, Math.round(count))
}

/** Cents -> a plain number of currency units, for Intl formatting only. */
export function centsToNumber(cents: Cents): number {
  return cents / 100
}

/** Currency units -> cents, rounding half-up. For parsed/typed input only. */
export function numberToCents(value: number): Cents {
  if (!Number.isFinite(value)) return 0
  return divideRoundHalfUp(Math.round(value * 1000), 10)
}

const AMOUNT_RE = /^([+-]?)(\d*)(?:\.(\d*))?$/
// Currency glyphs and group separators are stripped before parsing; \s already
// covers the non-breaking spaces Intl emits.
const NOISE_RE = /[$€£¥,\s]/g

/**
 * Parse keypad / pasted text into cents. Returns null for anything that is not
 * a number: '' , '.', 'abc', '1.2.3' all reject.
 *
 * '389' -> 38900, '389.5' -> 38950, '389.99' -> 38999, '0' -> 0.
 * More than two decimals are rounded half-up rather than rejected, so a pasted
 * '1234.567' becomes $1,234.57 instead of silently failing.
 */
export function parseAmountToCents(input: string): Cents | null {
  if (typeof input !== 'string') return null
  const cleaned = input.replace(NOISE_RE, '')
  if (cleaned === '') return null
  const m = AMOUNT_RE.exec(cleaned)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const whole = m[2] ?? ''
  const frac = m[3] ?? ''
  if (whole === '' && frac === '') return null // bare '.', '+', '-'
  const dollars = whole === '' ? 0 : Number(whole)
  if (!Number.isSafeInteger(dollars)) return null
  const centDigits = frac.slice(0, 2).padEnd(2, '0')
  let cents = dollars * 100 + Number(centDigits)
  const beyond = frac.slice(2)
  if (beyond !== '' && Number(beyond[0]) >= 5) cents += 1
  if (!Number.isSafeInteger(cents)) return null
  return sign * cents
}

/**
 * Fraction of a whole — uncapped, so 124% of goal comes back as 1.24 (spec §51).
 * A zero or missing whole yields 0 rather than Infinity/NaN.
 */
export function percentOf(part: Cents, whole: Cents): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return 0
  return part / whole
}

/** Clamp to a non-negative cent value. */
export function atLeastZero(cents: Cents): Cents {
  return cents > 0 ? cents : 0
}

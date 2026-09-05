/**
 * Settings value parsing.
 *
 * The reason this file exists: Settings and onboarding each had their own
 * percent parser, and they disagreed. Settings used
 * `Math.round(Number(cleaned) * 100)`, which is the float form ARCHITECTURE
 * forbids — '1.005' is 1.00499999999999989 in binary floating point, so it
 * rounded DOWN to 100bp while onboarding's `parseAmountToCents` route read the
 * decimal digits and rounded UP to 101bp. Same keystrokes, two stored rates.
 */
import { describe, expect, it } from 'vitest'

import { parseAmountToCents } from '@/core/money'
import {
  MAX_RATE_BASIS_POINTS,
  basisPointsToInput,
  centsToInput,
  parseMoneyInput,
  parsePercent,
  parsePercentInput,
  percentRejectionMessage,
} from './values'

/** Exactly what onboarding does — the reference the two must agree with. */
function onboardingRate(text: string): number | null {
  const parsed = parseAmountToCents(text.trim())
  if (parsed === null || parsed < 0) return null
  return parsed
}

describe('parsePercentInput', () => {
  it('reads whole and fractional percents as basis points', () => {
    expect(parsePercentInput('5')).toBe(500)
    expect(parsePercentInput('3.25')).toBe(325)
    expect(parsePercentInput('0')).toBe(0)
    expect(parsePercentInput('12.5')).toBe(1_250)
    expect(parsePercentInput('100')).toBe(10_000)
  })

  it('tolerates the % sign and surrounding whitespace', () => {
    expect(parsePercentInput('5%')).toBe(500)
    expect(parsePercentInput('  3.25 % ')).toBe(325)
  })

  it('rejects anything that is not a number', () => {
    expect(parsePercentInput('')).toBeNull()
    expect(parsePercentInput('   ')).toBeNull()
    expect(parsePercentInput('.')).toBeNull()
    expect(parsePercentInput('abc')).toBeNull()
    expect(parsePercentInput('1.2.3')).toBeNull()
  })

  it('rejects negative rates', () => {
    expect(parsePercentInput('-5')).toBeNull()
  })

  it('caps at 100%', () => {
    expect(parsePercentInput('100')).toBe(MAX_RATE_BASIS_POINTS)
    expect(parsePercentInput('100.01')).toBeNull()
    expect(parsePercentInput('500')).toBeNull()
  })

  /**
   * The regression itself. Each of these lands on a value binary floating point
   * represents just below the decimal midpoint, so `Number(x) * 100` rounds one
   * way and reading the digits rounds the other.
   */
  it('agrees with onboarding on the values that used to diverge', () => {
    for (const typed of ['1.005', '0.145', '0.285', '1.025']) {
      expect(parsePercentInput(typed)).toBe(onboardingRate(typed))
    }
  })

  it('rounds the third decimal digit half-up, the way the money parser does', () => {
    expect(parsePercentInput('1.005')).toBe(101)
    expect(parsePercentInput('0.145')).toBe(15)
    expect(parsePercentInput('0.285')).toBe(29)
    expect(parsePercentInput('1.025')).toBe(103)
    expect(parsePercentInput('1.004')).toBe(100)
  })

  it('never disagrees with onboarding across the range both accept', () => {
    for (let bp = 0; bp <= 1_000; bp += 1) {
      const typed = basisPointsToInput(bp)
      expect(parsePercentInput(typed)).toBe(onboardingRate(typed))
    }
  })
})

describe('parsePercent', () => {
  it('names the reason so a rejected value can always be explained', () => {
    expect(parsePercent('')).toEqual({ ok: false, reason: 'empty' })
    expect(parsePercent('abc')).toEqual({ ok: false, reason: 'not-a-number' })
    expect(parsePercent('-1')).toEqual({ ok: false, reason: 'negative' })
    expect(parsePercent('500')).toEqual({ ok: false, reason: 'above-max' })
    expect(parsePercent('5')).toEqual({ ok: true, basisPoints: 500 })
  })

  /**
   * The dead end this reason exists for: onboarding stored 500%, Settings
   * rendered "500" in the field, the old parser returned null, and Save stayed
   * disabled with nothing said. An out-of-range value has to be RECOGNISABLE,
   * not merely unparseable.
   */
  it('distinguishes an over-cap value from gibberish', () => {
    const overCap = parsePercent(basisPointsToInput(50_000))
    expect(overCap).toEqual({ ok: false, reason: 'above-max' })
    expect(percentRejectionMessage('above-max')).toContain('100%')
    expect(percentRejectionMessage('above-max')).not.toBe(
      percentRejectionMessage('not-a-number'),
    )
  })

  it('has a message for every reason', () => {
    for (const reason of ['empty', 'not-a-number', 'negative', 'above-max'] as const) {
      expect(percentRejectionMessage(reason).length).toBeGreaterThan(0)
      expect(percentRejectionMessage(reason, { blankAllowed: true })).toContain('blank')
    }
  })
})

describe('basisPointsToInput', () => {
  it('round-trips through the parser', () => {
    for (const bp of [0, 1, 25, 300, 325, 500, 1_050, 10_000]) {
      expect(parsePercentInput(basisPointsToInput(bp))).toBe(bp)
    }
  })

  it('shows whole percents without a decimal tail', () => {
    expect(basisPointsToInput(500)).toBe('5')
    expect(basisPointsToInput(325)).toBe('3.25')
    expect(basisPointsToInput(105)).toBe('1.05')
    expect(basisPointsToInput(0)).toBe('0')
  })

  it('shows a rate that is over the cap rather than an empty box', () => {
    expect(basisPointsToInput(50_000)).toBe('500')
  })
})

describe('money fields', () => {
  it('parses dollars into cents and refuses negatives', () => {
    expect(parseMoneyInput('10000')).toBe(1_000_000)
    expect(parseMoneyInput('389.99')).toBe(38_999)
    expect(parseMoneyInput('-1')).toBeNull()
    expect(parseMoneyInput('')).toBeNull()
  })

  it('round-trips cents through the display form', () => {
    for (const cents of [0, 5, 100, 38_999, 1_000_000]) {
      expect(parseMoneyInput(centsToInput(cents))).toBe(cents)
    }
  })
})

/**
 * Add Sale field logic — the parts that decide which commission rate gets
 * FROZEN onto a record (§69). No DOM here: this is the resolution rule the
 * sheet renders, tested on its own.
 */
import { describe, expect, it } from 'vitest'
import { makeCategory, makeSale } from '@/core/calc/fixtures'
import { commissionFor } from '@/core/money'
import {
  currencySymbol,
  parseRate,
  plainAmount,
  rateOverrideForCategory,
  rateToText,
  resolveRate,
} from './saleFields'

/** The sheet's own step: the override text becomes a typed rate, or null. */
const typed = (override: string | null) => (override === null ? null : parseRate(override))

const DEFAULT_RATE = 500 // 5%
const primary = makeCategory({ id: 'cat-primary', name: 'Primary Sale', commissionRate: 500 })
const upsell = makeCategory({ id: 'cat-upsell', name: 'Upsell', commissionRate: 800 })
const noRule = makeCategory({ id: 'cat-other', name: 'Other', commissionRate: null })

describe('parseRate', () => {
  it('reads a percentage onto the basis-point scale', () => {
    expect(parseRate('5')).toBe(500)
    expect(parseRate('3.25')).toBe(325)
    expect(parseRate(' 8 ')).toBe(800)
  })

  it('rejects what is not a rate', () => {
    expect(parseRate('')).toBeNull()
    expect(parseRate('abc')).toBeNull()
    expect(parseRate('5%')).toBeNull()
    expect(parseRate('-2')).toBeNull()
  })

  it('round-trips through rateToText', () => {
    for (const basisPoints of [0, 500, 325, 1250]) {
      expect(parseRate(rateToText(basisPoints))).toBe(basisPoints)
    }
  })
})

describe('resolveRate', () => {
  it('prefers an explicit override, then the sale, then the category, then the default', () => {
    expect(resolveRate(750, null, upsell, DEFAULT_RATE)).toBe(750)
    const sale = makeSale({ amount: 50_000, date: '2026-09-04', commissionRate: 600 })
    expect(resolveRate(null, sale, upsell, DEFAULT_RATE)).toBe(600)
    expect(resolveRate(null, null, upsell, DEFAULT_RATE)).toBe(800)
    expect(resolveRate(null, null, noRule, DEFAULT_RATE)).toBe(DEFAULT_RATE)
    expect(resolveRate(null, null, null, DEFAULT_RATE)).toBe(DEFAULT_RATE)
  })
})

describe('rateOverrideForCategory', () => {
  it('leaves the no-override case alone', () => {
    expect(rateOverrideForCategory(null, upsell)).toBeNull()
    expect(rateOverrideForCategory(null, null)).toBeNull()
  })

  it('drops an override when the new category carries its own rule', () => {
    expect(rateOverrideForCategory('8', primary)).toBeNull()
  })

  it('keeps an override when the new category has no rule of its own', () => {
    expect(rateOverrideForCategory('8', noRule)).toBe('8')
    expect(rateOverrideForCategory('8', null)).toBe('8')
  })
})

describe('the §69 reproduction: Upsell, Change, Done, Primary Sale', () => {
  it('lands on the primary rate and not the pinned upsell one', () => {
    const amount = 50_000 // $500

    // Tap Upsell: no override yet, so the category rule governs.
    let override: string | null = null
    expect(resolveRate(typed(override), null, upsell, DEFAULT_RATE)).toBe(800)

    // Open the Change panel and close it again WITHOUT editing. Merely looking
    // at the rate is not an override, so nothing is pinned.
    expect(override).toBeNull()

    // Tap Primary Sale.
    override = rateOverrideForCategory(override, primary)
    const rate = resolveRate(typed(override), null, primary, DEFAULT_RATE)

    expect(rate).toBe(500)
    expect(commissionFor(amount, rate)).toBe(2_500) // $25.00, not $40.00
  })

  it('a real override is replaced by a category that has its own rule', () => {
    let override: string | null = '12'
    expect(resolveRate(typed(override), null, noRule, DEFAULT_RATE)).toBe(1_200)

    override = rateOverrideForCategory(override, upsell)
    expect(override).toBeNull()
    expect(resolveRate(typed(override), null, upsell, DEFAULT_RATE)).toBe(800)
  })
})

describe('the keypad currency glyph (§55, §63)', () => {
  const cases: ReadonlyArray<[string, string, string, string]> = [
    ['en-US', 'USD', '$', '389.00'],
    ['en-GB', 'GBP', '£', '389.00'],
    ['fr-FR', 'EUR', '€', '389,00'],
    ['sv-SE', 'SEK', 'kr', '389,00'],
  ]

  it.each(cases)('%s / %s shows %s and no other', (locale, currency, symbol, figure) => {
    const settings = { locale, currency }
    expect(currencySymbol(settings)).toBe(symbol)
    // The figure keeps its locale separators and carries no glyph of its own,
    // so the display cannot read "$389,00 €" while the aria-label says euros.
    expect(plainAmount(38_900, settings, symbol)).toBe(figure)
  })

  it('leaves a zero balance printable', () => {
    const settings = { locale: 'en-US', currency: 'USD' }
    expect(plainAmount(0, settings, currencySymbol(settings))).toBe('0.00')
  })
})

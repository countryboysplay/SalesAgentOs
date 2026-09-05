/**
 * Ledger filter selection — the part that decides what "a filter is on" means.
 *
 * The rule these specs protect: a facet counts as active only when it actually
 * narrows something. Anything counted here turns on the summary chip, the Clear
 * button, the All view's "Matching your filters" sub-label and the ledger's
 * "Nothing matches these filters" empty state — so a facet that the predicate
 * silently discards must not be counted, or all four of those blame a filter
 * that is not doing anything.
 */
import { describe, expect, it } from 'vitest'
import { makeCategory, makeSale } from '@/core/calc/fixtures'
import {
  EMPTY_FILTERS,
  activeFilterCount,
  amountFieldError,
  buildSalePredicate,
  describeFilters,
  hasActiveFilters,
  type SaleFilters,
} from './ledger'

const RENEWALS = makeCategory({ id: 'cat-renewals', name: 'Renewals' })
const CATEGORIES = new Map([[RENEWALS.id, RENEWALS]])

function filters(overrides: Partial<SaleFilters> = {}): SaleFilters {
  return { ...EMPTY_FILTERS, ...overrides }
}

describe('activeFilterCount', () => {
  it('counts nothing for the empty filter set', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })

  it('counts an amount bound that parses', () => {
    expect(activeFilterCount(filters({ minAmount: '1000' }))).toBe(1)
    expect(activeFilterCount(filters({ maxAmount: '2,500.50' }))).toBe(1)
    expect(activeFilterCount(filters({ minAmount: '10', maxAmount: '20' }))).toBe(1)
  })

  it('ignores an amount that cannot be parsed, because the predicate ignores it too', () => {
    const typo = filters({ minAmount: 'abc' })
    expect(activeFilterCount(typo)).toBe(0)
    expect(hasActiveFilters(typo)).toBe(false)

    // The predicate is the reason: it excludes nothing, so nothing may claim it did.
    const predicate = buildSalePredicate(typo, CATEGORIES)
    expect(predicate(makeSale({ amount: 100, date: '2026-09-04' }))).toBe(true)
  })

  it('ignores a date bound that is not a real YYYY-MM-DD', () => {
    expect(activeFilterCount(filters({ from: '2026-13-45' as never }))).toBe(0)
    expect(activeFilterCount(filters({ from: '2026-09-01' }))).toBe(1)
  })

  it('still counts every facet that is genuinely narrowing', () => {
    const all = filters({
      query: 'renew',
      from: '2026-09-01',
      categoryIds: [RENEWALS.id],
      statuses: ['cancelled'],
      maxAmount: '500',
    })
    expect(activeFilterCount(all)).toBe(5)
  })
})

describe('amountFieldError', () => {
  it('is silent for an empty box and for anything that parses', () => {
    expect(amountFieldError('')).toBeNull()
    expect(amountFieldError('  ')).toBeNull()
    expect(amountFieldError('1,250.50')).toBeNull()
    expect(amountFieldError('$400')).toBeNull()
  })

  it('says so for text a money field cannot use', () => {
    expect(amountFieldError('abc')).toContain('Enter an amount')
    expect(amountFieldError('1.2.3')).toContain('Enter an amount')
  })
})

describe('describeFilters', () => {
  it('names both things the search actually matches', () => {
    // The predicate matches a note OR a category name, so a row with an empty
    // note can appear under this chip — "Note contains" alone was a lie.
    const predicate = buildSalePredicate(filters({ query: 'renew' }), CATEGORIES)
    const noNote = makeSale({ amount: 50_000, date: '2026-09-04', categoryId: RENEWALS.id })
    expect(predicate(noNote)).toBe(true)

    expect(describeFilters(filters({ query: 'renew' }), CATEGORIES)).toEqual([
      'Note or category contains "renew"',
    ])
  })

  it('leaves out an amount bound it could not parse', () => {
    expect(describeFilters(filters({ minAmount: 'abc' }), CATEGORIES)).toEqual([])
    expect(describeFilters(filters({ minAmount: '250' }), CATEGORIES)).toEqual(['Over $250'])
    expect(describeFilters(filters({ maxAmount: '250' }), CATEGORIES)).toEqual(['Under $250'])
    expect(describeFilters(filters({ minAmount: '10', maxAmount: '20' }), CATEGORIES)).toEqual([
      '$10–$20',
    ])
  })

  it('leaves out a date bound it could not parse', () => {
    expect(describeFilters(filters({ from: 'not-a-date' as never }), CATEGORIES)).toEqual([])
    expect(describeFilters(filters({ from: '2026-09-01', to: '2026-09-30' }), CATEGORIES)).toEqual([
      '2026-09-01 to 2026-09-30',
    ])
  })
})

describe('buildSalePredicate', () => {
  it('keeps cancelled rows visible when the status filter asks for them (§18)', () => {
    const predicate = buildSalePredicate(filters({ statuses: ['cancelled'] }), CATEGORIES)
    expect(predicate(makeSale({ amount: 50_000, date: '2026-09-04', status: 'cancelled' }))).toBe(
      true,
    )
    expect(predicate(makeSale({ amount: 50_000, date: '2026-09-04' }))).toBe(false)
  })

  it('reads the amount range against the originally recorded amount', () => {
    const predicate = buildSalePredicate(filters({ minAmount: '400' }), CATEGORIES)
    // Cancelled: worth $0 to net, but it is still a $500 sale on the row.
    expect(
      predicate(makeSale({ amount: 50_000, date: '2026-09-04', status: 'cancelled' })),
    ).toBe(true)
    expect(predicate(makeSale({ amount: 30_000, date: '2026-09-04' }))).toBe(false)
  })
})

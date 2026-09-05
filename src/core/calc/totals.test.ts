import {
  countByDay,
  effectiveAmount,
  effectiveCommission,
  isActive,
  isCancelled,
  netByDay,
  netByMonth,
  removedAmount,
  selectSales,
  totalsFor,
  totalsForDay,
  totalsForMonth,
  totalsForRange,
  totalsForYear,
} from './totals'
import { adjust, cancel, makeSale } from './fixtures'

const sales = [
  makeSale({ amount: 38_900, date: '2026-09-04', time: '09:14' }),
  makeSale({ amount: 21_400, date: '2026-09-04', time: '11:42' }),
  makeSale({ amount: 13_900, date: '2026-09-04', time: '14:07' }),
]

describe('per-sale primitives', () => {
  it('reads status', () => {
    const sale = sales[0]
    expect(isActive(sale)).toBe(true)
    expect(isCancelled(sale)).toBe(false)
    expect(isCancelled(cancel(sale))).toBe(true)
    expect(isActive(cancel(sale))).toBe(false)
  })

  it('computes the amount that still stands', () => {
    expect(effectiveAmount(sales[0])).toBe(38_900)
    expect(effectiveAmount(cancel(sales[0]))).toBe(0)
    expect(effectiveAmount(adjust(sales[0], 20_000))).toBe(20_000)
    expect(removedAmount(cancel(sales[0]))).toBe(38_900)
    expect(removedAmount(adjust(sales[0], 20_000))).toBe(18_900)
  })

  it('uses the frozen commission, and never a current-settings rate', () => {
    const sale = makeSale({ amount: 50_000, date: '2026-03-01', commissionRate: 500 })
    expect(sale.commissionAmount).toBe(2500)
    // A later rate change cannot reach this sale: nothing recomputes from settings.
    expect(effectiveCommission(sale)).toBe(2500)
    expect(effectiveCommission(cancel(sale))).toBe(0)
    // An adjusted sale re-derives from its OWN frozen rate, not today's.
    expect(effectiveCommission(adjust(sale, 20_000))).toBe(1000)
  })
})

describe('totalsFor', () => {
  it('totals a plain day (spec §20)', () => {
    const totals = totalsForDay(sales, '2026-09-04')
    expect(totals.grossSales).toBe(74_200)
    expect(totals.cancelledSales).toBe(0)
    expect(totals.netSales).toBe(74_200)
    expect(totals.saleCount).toBe(3)
    expect(totals.averageSale).toBe(24_733)
    expect(totals.estimatedCommission).toBe(3710) // $37.10
  })

  it('returns zeroes for an empty period', () => {
    const totals = totalsForDay(sales, '2026-09-05')
    expect(totals).toEqual({
      grossSales: 0,
      cancelledSales: 0,
      netSales: 0,
      saleCount: 0,
      averageSale: 0,
      estimatedCommission: 0,
    })
  })

  it('keeps a cancelled sale in gross and out of net (spec §18)', () => {
    const withCancellation = [sales[0], cancel(sales[1]), sales[2]]
    const totals = totalsForDay(withCancellation, '2026-09-04')
    expect(totals.grossSales).toBe(74_200)
    expect(totals.cancelledSales).toBe(21_400)
    expect(totals.netSales).toBe(52_800)
    expect(totals.saleCount).toBe(2)
    expect(totals.estimatedCommission).toBe(2640)
  })

  it('treats a downward adjustment as a partial cancellation', () => {
    const adjusted = [adjust(sales[0], 20_000)]
    const totals = totalsForDay(adjusted, '2026-09-04')
    expect(totals.grossSales).toBe(38_900)
    expect(totals.cancelledSales).toBe(18_900)
    expect(totals.netSales).toBe(20_000)
    expect(totals.saleCount).toBe(1)
    expect(totals.averageSale).toBe(20_000)
    expect(totals.estimatedCommission).toBe(1000)
  })

  it('handles an upward adjustment without breaking the identity', () => {
    const totals = totalsForDay([adjust(sales[0], 50_000)], '2026-09-04')
    expect(totals.netSales).toBe(50_000)
    expect(totals.grossSales - totals.cancelledSales).toBe(totals.netSales)
  })

  it('always satisfies net === gross - cancelled', () => {
    const mixed = [sales[0], cancel(sales[1]), adjust(sales[2], 5000)]
    const totals = totalsForDay(mixed, '2026-09-04')
    expect(totals.grossSales - totals.cancelledSales).toBe(totals.netSales)
    expect(totals.netSales).toBe(38_900 + 0 + 5000)
  })

  it('averages net over active sales only', () => {
    const mixed = [sales[0], cancel(sales[1])]
    const totals = totalsForDay(mixed, '2026-09-04')
    expect(totals.saleCount).toBe(1)
    expect(totals.averageSale).toBe(38_900)
  })
})

describe('period selection', () => {
  const spread = [
    makeSale({ amount: 10_000, date: '2026-01-15' }),
    makeSale({ amount: 20_000, date: '2026-02-15' }),
    makeSale({ amount: 30_000, date: '2026-09-04' }),
    makeSale({ amount: 40_000, date: '2027-01-02' }),
  ]

  it('selects by inclusive range', () => {
    expect(totalsForRange(spread, '2026-01-01', '2026-02-28').netSales).toBe(30_000)
    expect(totalsForRange(spread, '2026-01-15', '2026-01-15').netSales).toBe(10_000)
    expect(totalsForRange(spread, '2026-03-01', '2026-08-31').netSales).toBe(0)
  })

  it('selects months and years', () => {
    expect(totalsForMonth(spread, '2026-02-11').netSales).toBe(20_000)
    expect(totalsForMonth(spread, '2026-02').netSales).toBe(20_000)
    expect(totalsForYear(spread, 2026).netSales).toBe(60_000)
    expect(totalsForYear(spread, '2027-06-01').netSales).toBe(40_000)
  })

  it('accepts an arbitrary predicate', () => {
    const big = totalsFor(spread, (sale) => sale.amount >= 30_000)
    expect(big.netSales).toBe(70_000)
    expect(big.saleCount).toBe(2)
  })

  it('totals everything when no selector is given', () => {
    expect(totalsFor(spread).netSales).toBe(100_000)
    expect(selectSales(spread)).toHaveLength(4)
  })

  it('books a cancellation against the sale, not the cancellation date', () => {
    // A January sale cancelled in March corrects January's net (spec §69).
    const januarySale = makeSale({ amount: 50_000, date: '2026-01-15' })
    const later = [cancel(januarySale, '2026-03-02')]
    expect(totalsForMonth(later, '2026-01-01').netSales).toBe(0)
    expect(totalsForMonth(later, '2026-01-01').cancelledSales).toBe(50_000)
    expect(totalsForMonth(later, '2026-03-01').netSales).toBe(0)
    expect(totalsForMonth(later, '2026-03-01').grossSales).toBe(0)
  })

  it('keeps a 23:59 sale in its own day', () => {
    const lateSale = makeSale({ amount: 25_000, date: '2026-09-04', time: '23:59' })
    expect(totalsForDay([lateSale], '2026-09-04').netSales).toBe(25_000)
    expect(totalsForDay([lateSale], '2026-09-05').netSales).toBe(0)
  })
})

describe('bucketed helpers', () => {
  const spread = [
    makeSale({ amount: 10_000, date: '2026-01-15' }),
    makeSale({ amount: 20_000, date: '2026-01-15' }),
    cancel(makeSale({ amount: 90_000, date: '2026-01-16' })),
    makeSale({ amount: 30_000, date: '2026-02-15' }),
  ]

  it('groups net by day and month', () => {
    expect(netByDay(spread).get('2026-01-15')).toBe(30_000)
    expect(netByDay(spread).get('2026-01-16')).toBe(0)
    expect(netByMonth(spread).get('2026-01')).toBe(30_000)
    expect(netByMonth(spread).get('2026-02')).toBe(30_000)
  })

  it('counts active sales per day', () => {
    expect(countByDay(spread).get('2026-01-15')).toBe(2)
    expect(countByDay(spread).has('2026-01-16')).toBe(false)
  })
})

describe('performance sanity', () => {
  it('totals 1000 sales well inside a frame budget', () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      makeSale({
        amount: 10_000 + i,
        date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        status: i % 50 === 0 ? 'cancelled' : 'active',
      }),
    )
    const started = performance.now()
    const totals = totalsFor(many)
    const yearTotals = totalsForYear(many, 2026)
    const elapsed = performance.now() - started
    expect(totals.saleCount).toBe(980)
    expect(yearTotals.netSales).toBe(totals.netSales)
    expect(totals.grossSales - totals.cancelledSales).toBe(totals.netSales)
    expect(elapsed).toBeLessThan(50)
  })
})

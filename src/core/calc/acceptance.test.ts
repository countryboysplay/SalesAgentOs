/**
 * Spec §77 — Development Acceptance Tests.
 *
 * The four scenarios below are the ones the product is judged on. They are kept
 * together, in the spec's own words, so a regression is impossible to miss.
 * (The Offline, Persistence and Backup tests belong to the data layer.)
 */
import { goalFor } from './goals'
import { monthlyPace } from './pace'
import { goalStreak } from './records'
import { totalsForDay, totalsForMonth } from './totals'
import { cancel, makeGoal, makeSale, makeSettings } from './fixtures'

const settings = makeSettings() // Monday-Friday

describe('spec §77 acceptance', () => {
  it('Cancellation Test: $500 sale shows $500, then $0 net, and stays in history', () => {
    const sale = makeSale({ amount: 50_000, date: '2026-09-04' })

    const before = totalsForDay([sale], '2026-09-04')
    expect(before.netSales).toBe(50_000) // dashboard: $500

    const cancelled = cancel(sale, '2026-09-10')
    const after = totalsForDay([cancelled], '2026-09-04')
    expect(after.netSales).toBe(0) // dashboard: $0 net
    expect(after.saleCount).toBe(0)
    expect(after.estimatedCommission).toBe(0)

    // History still shows the original $500 as a cancelled sale.
    expect(after.grossSales).toBe(50_000)
    expect(after.cancelledSales).toBe(50_000)
    expect(cancelled.amount).toBe(50_000)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancellation?.cancelledOn).toBe('2026-09-10')
  })

  it('Goal Change Test: January keeps comparing against $8,000 after February is raised', () => {
    const january = makeGoal({
      type: 'monthly',
      amount: 800_000, // $8,000
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-01-31',
      createdAt: 1,
    })
    const februaryOnward = makeGoal({
      type: 'monthly',
      amount: 1_000_000, // $10,000
      effectiveFrom: '2026-02-01',
      createdAt: 2,
    })
    const goals = [january, februaryOnward]

    expect(goalFor('monthly', '2026-01-15', goals)?.amount).toBe(800_000)
    expect(goalFor('monthly', '2026-02-15', goals)?.amount).toBe(1_000_000)

    // Reviewed in June, January is still measured against $8,000.
    const sales = [makeSale({ amount: 800_000, date: '2026-01-20' })]
    const januaryPace = monthlyPace(sales, goals, settings, '2026-01-15', '2026-06-01')
    expect(januaryPace.goal).toBe(800_000)
    expect(januaryPace.progress).toBe(1)
    expect(januaryPace.status).toBe('goal-reached')

    // The same performance in February would have fallen short.
    const februarySales = [makeSale({ amount: 800_000, date: '2026-02-20' })]
    const februaryPace = monthlyPace(februarySales, goals, settings, '2026-02-15', '2026-06-01')
    expect(februaryPace.goal).toBe(1_000_000)
    expect(februaryPace.status).toBe('behind')
  })

  it('Commission Test: $500 at 5% + $500 at 3% = $40 estimated commission', () => {
    const saleA = makeSale({ amount: 50_000, date: '2026-09-04', commissionRate: 500 })
    const saleB = makeSale({ amount: 50_000, date: '2026-09-04', commissionRate: 300 })

    expect(saleA.commissionAmount).toBe(2500) // $25.00
    expect(saleB.commissionAmount).toBe(1500) // $15.00

    const totals = totalsForDay([saleA, saleB], '2026-09-04')
    expect(totals.estimatedCommission).toBe(4000) // $40.00
    expect(totalsForMonth([saleA, saleB], '2026-09').estimatedCommission).toBe(4000)
  })

  it('Working Day Test: a Friday streak survives a quiet weekend and continues on Monday', () => {
    const dailyGoal = makeGoal({ type: 'daily', amount: 50_000, effectiveFrom: '2026-01-01' })
    const sales = [
      makeSale({ amount: 60_000, date: '2026-09-02' }), // Wednesday
      makeSale({ amount: 60_000, date: '2026-09-03' }), // Thursday
      makeSale({ amount: 60_000, date: '2026-09-04' }), // Friday — streak of 3
      // Saturday 5th and Sunday 6th: nothing recorded.
      makeSale({ amount: 60_000, date: '2026-09-07' }), // Monday
    ]

    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-04')).toBe(3)
    // The weekend is skipped, not counted as two misses.
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-06')).toBe(3)
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-07')).toBe(4)
  })
})

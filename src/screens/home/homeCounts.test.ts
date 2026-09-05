/**
 * The figures Home reads off core/calc, pinned as a contract.
 *
 * Home computes nothing (ARCHITECTURE rule 6), so these specs cover the three
 * places where it used to reach for the wrong selector — or for no selector at
 * all — and where the screen therefore contradicted itself.
 */
import { describe, expect, it } from 'vitest'
import { cancel, makeGoal, makeSale, makeSettings } from '@/core/calc/fixtures'
import { countByDay, dailyPace, netByDay, totalsForDay } from '@/core/calc'

const FRIDAY = '2026-09-04'
const SATURDAY = '2026-09-05'
const settings = makeSettings() // Mon-Fri

describe("Today's Sales header count (§13, §18)", () => {
  const sales = [
    makeSale({ amount: 30_000, date: FRIDAY, time: '09:10' }),
    cancel(makeSale({ amount: 20_000, date: FRIDAY, time: '11:00' })),
    makeSale({ amount: 25_000, date: FRIDAY, time: '14:30' }),
  ]

  it('counts the sales that stand, not the rows on screen', () => {
    // The list shows all three (a cancelled sale stays visible, §18) while the
    // header and the Today card both say two.
    expect(sales.length).toBe(3)
    expect(totalsForDay(sales, FRIDAY).saleCount).toBe(2)
  })

  it('leaves a cancelled-only day with rows to show but nothing to count', () => {
    const cancelledOnly = [cancel(makeSale({ amount: 20_000, date: FRIDAY }))]
    expect(cancelledOnly.length).toBe(1) // the empty state must not take over
    expect(totalsForDay(cancelledOnly, FRIDAY).saleCount).toBe(0)
    expect(totalsForDay(cancelledOnly, FRIDAY).netSales).toBe(0)
  })
})

describe('days with sales, for the new-record guard (§53)', () => {
  const sales = [
    makeSale({ amount: 30_000, date: FRIDAY }),
    cancel(makeSale({ amount: 20_000, date: '2026-09-03' })),
  ]

  it('does not count a day whose only sale was cancelled', () => {
    // netByDay keys every date it sees, cancelled or not, so it read as two
    // trading days and fired the confetti on the very first real one.
    expect(netByDay(sales).size).toBe(2)
    expect(countByDay(sales).size).toBe(1)
  })
})

describe('the Today card on a non-working day (§10, §52)', () => {
  const goals = [makeGoal({ type: 'daily', amount: 100_000, effectiveFrom: '2026-01-01' })]
  const sales = [makeSale({ amount: 50_000, date: SATURDAY })]
  const pace = dailyPace(sales, goals, settings, SATURDAY)

  it('has no pace to report: nothing was expected of a day off', () => {
    expect(pace.workdaysTotal).toBe(0)
    expect(pace.expected).toBe(0)
    // difference is actual - EXPECTED, so on a day off it is the whole day's
    // takings. Reading "above goal" off it labelled a half-finished day ahead.
    expect(pace.difference).toBe(50_000)
  })

  it('is plainly below the goal, which is what the card must say', () => {
    expect(pace.progress).toBeCloseTo(0.5)
    expect(pace.remaining).toBe(50_000) // > 0 -> not above goal
  })

  it('agrees with difference once the day is a working day', () => {
    const friday = dailyPace(
      [makeSale({ amount: 120_000, date: FRIDAY })],
      goals,
      settings,
      FRIDAY,
    )
    expect(friday.remaining).toBe(0) // above goal
    expect(friday.actual - (friday.goal ?? 0)).toBe(friday.difference)
  })
})

/**
 * A goal must govern the period it was created in.
 *
 * Goals are stamped `effectiveFrom = today`, so a monthly goal set on the 4th
 * does not cover the 1st. Resolving a month only at its first day therefore
 * reported "no goal" for the rest of the month the user set it in, and hid an
 * annual goal until the following January — the app's headline question left
 * unanswerable for anyone who did not onboard on the 1st.
 */

import { describe, expect, it } from 'vitest'

import { goalAmountForPeriod, goalForPeriod } from './goals'
import { monthlyPace, annualPace } from './pace'
import type { Goal, Sale, Weekday } from '../types'

const WORKDAYS: { workdays: Weekday[]; excludedDates: string[] } = {
  workdays: [1, 2, 3, 4, 5],
  excludedDates: [],
}

function goal(over: Partial<Goal> & Pick<Goal, 'type' | 'amount' | 'effectiveFrom'>): Goal {
  return {
    id: `g-${over.type}-${over.effectiveFrom}`,
    effectiveTo: null,
    enabled: true,
    createdAt: Date.parse(`${over.effectiveFrom}T12:00:00`),
    ...over,
  }
}

function sale(amount: number, date: string): Sale {
  return {
    id: `s-${date}-${amount}`,
    amount,
    date,
    time: '10:00',
    categoryId: null,
    commissionRate: 500,
    commissionAmount: Math.round(amount * 0.05),
    note: null,
    status: 'active',
    createdAt: 0,
    modifiedAt: 0,
    cancellation: null,
    adjustedAmount: null,
  }
}

describe('goalForPeriod', () => {
  it('finds a goal created part-way through the period', () => {
    const goals = [goal({ type: 'monthly', amount: 3_000_000, effectiveFrom: '2026-09-04' })]
    expect(goalAmountForPeriod('monthly', '2026-09-01', '2026-09-30', goals)).toBe(3_000_000)
  })

  it('shows an annual goal in the year it was set, not the next one', () => {
    const goals = [goal({ type: 'annual', amount: 36_000_000, effectiveFrom: '2026-09-04' })]
    expect(goalAmountForPeriod('annual', '2026-01-01', '2026-12-31', goals)).toBe(36_000_000)
  })

  it('still lets a mid-period change apply prospectively (§32)', () => {
    // January-August $9,000, September onward $10,000 — September's revision
    // must not rewrite what August was measured against.
    const goals = [
      goal({ type: 'monthly', amount: 900_000, effectiveFrom: '2026-01-01', effectiveTo: '2026-09-09' }),
      goal({ type: 'monthly', amount: 1_000_000, effectiveFrom: '2026-09-10' }),
    ]
    // The month already had a goal on day one, so the mid-month change waits.
    expect(goalAmountForPeriod('monthly', '2026-09-01', '2026-09-30', goals)).toBe(900_000)
    expect(goalAmountForPeriod('monthly', '2026-08-01', '2026-08-31', goals)).toBe(900_000)
    expect(goalAmountForPeriod('monthly', '2026-10-01', '2026-10-31', goals)).toBe(1_000_000)
  })

  it('ignores a goal that starts after the period ends', () => {
    const goals = [goal({ type: 'monthly', amount: 1_000_000, effectiveFrom: '2026-10-01' })]
    expect(goalForPeriod('monthly', '2026-09-01', '2026-09-30', goals)).toBeNull()
  })

  it('respects a disabled goal rather than falling back', () => {
    const goals = [goal({ type: 'monthly', amount: 0, effectiveFrom: '2026-09-04', enabled: false })]
    expect(goalForPeriod('monthly', '2026-09-01', '2026-09-30', goals)).toBeNull()
  })
})

describe('pace after onboarding mid-month', () => {
  const goals = [
    goal({ type: 'monthly', amount: 3_000_000, effectiveFrom: '2026-09-04' }),
    goal({ type: 'annual', amount: 36_000_000, effectiveFrom: '2026-09-04' }),
  ]
  const sales = [sale(50_000, '2026-09-04')]

  it('reports a monthly goal instead of "no goal"', () => {
    const pace = monthlyPace(sales, goals, WORKDAYS, '2026-09-04', '2026-09-04')
    expect(pace.status).not.toBe('no-goal')
    expect(pace.goal).toBe(3_000_000)
    expect(pace.actual).toBe(50_000)
  })

  it('reports an annual goal in the year it was set', () => {
    const pace = annualPace(sales, goals, WORKDAYS, '2026-09-04', '2026-09-04')
    expect(pace.status).not.toBe('no-goal')
    expect(pace.goal).toBe(36_000_000)
  })

  // The goal amount resolving for the whole month/year (above) is only half the
  // story: the WORKDAY WINDOW pace measures against must also start no earlier
  // than the goal's own effectiveFrom, or a goal set minutes ago reads as
  // already thousands of dollars behind a target it could not have been
  // measured against on any earlier day. Sep 4, 2026 is a Friday, so one
  // workday (the 4th itself) has elapsed under each goal, not four (from the
  // 1st) or 177 (from Jan 1).
  it("measures monthly pace from the goal's effectiveFrom, not the 1st of the month", () => {
    const pace = monthlyPace(sales, goals, WORKDAYS, '2026-09-04', '2026-09-04')
    expect(pace.workdaysTotal).toBe(19) // Sep 4-30, not Sep 1-30 (22)
    expect(pace.workdaysElapsed).toBe(1) // just the 4th itself
    expect(pace.workdaysRemaining).toBe(18)
    expect(pace.expected).toBe(157_895) // $3,000,000 x 1/19
    expect(pace.difference).toBe(-107_895)
    expect(pace.status).toBe('behind') // a real shortfall against one elapsed day — not four
    expect(pace.requiredPerWorkday).toBe(163_889)
  })

  it("measures annual pace from the goal's effectiveFrom, not Jan 1", () => {
    const pace = annualPace(sales, goals, WORKDAYS, '2026-09-04', '2026-09-04')
    expect(pace.workdaysTotal).toBe(85) // Sep 4 - Dec 31, not Jan 1 - Dec 31 (261)
    expect(pace.workdaysElapsed).toBe(1)
    expect(pace.workdaysRemaining).toBe(84)
    expect(pace.expected).toBe(423_529) // $36,000,000 x 1/85
    expect(pace.difference).toBe(-373_529)
    expect(pace.status).toBe('behind')
    expect(pace.requiredPerWorkday).toBe(427_976)
  })
})

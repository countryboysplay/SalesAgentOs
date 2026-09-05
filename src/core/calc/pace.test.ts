import {
  annualPace,
  computePace,
  dailyPace,
  monthlyPace,
  monthsRemainingInYear,
  requiredPerRemainingMonth,
  shiftMonth,
} from './pace'
import { makeGoal, makeSale, makeSettings } from './fixtures'

const settings = makeSettings()

const dailyGoal = makeGoal({ type: 'daily', amount: 50_000, effectiveFrom: '2026-01-01' })
const monthlyGoal = makeGoal({ type: 'monthly', amount: 1_000_000, effectiveFrom: '2026-01-01' })
const annualGoal = makeGoal({ type: 'annual', amount: 12_000_000, effectiveFrom: '2026-01-01' })
const goals = [dailyGoal, monthlyGoal, annualGoal]

describe('computePace', () => {
  it('matches the spec §66 monthly pace example', () => {
    const pace = computePace({
      goal: 1_000_000, // $10,000
      actual: 585_000, // $5,850
      workdaysTotal: 20,
      workdaysElapsed: 10,
      workdaysRemaining: 10,
    })
    expect(pace.expected).toBe(500_000) // $5,000
    expect(pace.difference).toBe(85_000) // $850 ahead
    expect(pace.status).toBe('ahead')
    expect(pace.remaining).toBe(415_000)
  })

  it('matches the spec §67 required-remaining example', () => {
    const pace = computePace({
      goal: 1_000_000,
      actual: 785_000, // $7,850
      workdaysTotal: 20,
      workdaysElapsed: 11,
      workdaysRemaining: 9,
    })
    expect(pace.remaining).toBe(215_000) // $2,150
    expect(pace.requiredPerWorkday).toBe(23_889) // $238.89
    expect(pace.progress).toBeCloseTo(0.785, 10)
  })

  it('reports progress uncapped past the goal (spec §51)', () => {
    const pace = computePace({
      goal: 1_000_000,
      actual: 1_240_000,
      workdaysTotal: 20,
      workdaysElapsed: 15,
      workdaysRemaining: 5,
    })
    expect(pace.progress).toBeCloseTo(1.24, 10)
    expect(pace.status).toBe('goal-reached')
    expect(pace.remaining).toBe(0)
    expect(pace.requiredPerWorkday).toBe(0)
  })

  it('calls exactly-100% goal-reached', () => {
    const pace = computePace({
      goal: 1_000_000,
      actual: 1_000_000,
      workdaysTotal: 20,
      workdaysElapsed: 5,
      workdaysRemaining: 15,
    })
    expect(pace.status).toBe('goal-reached')
    expect(pace.progress).toBe(1)
  })

  it('flags behind pace beyond the tolerance band', () => {
    const pace = computePace({
      goal: 1_000_000,
      actual: 456_200,
      workdaysTotal: 20,
      workdaysElapsed: 10,
      workdaysRemaining: 10,
    })
    expect(pace.difference).toBe(-43_800) // -$438 (spec §12)
    expect(pace.status).toBe('behind')
  })

  it('stays on-track inside the tolerance band', () => {
    // Tolerance is 2% of expected: $100 either side of a $5,000 expectation.
    const inside = computePace({
      goal: 1_000_000,
      actual: 509_000,
      workdaysTotal: 20,
      workdaysElapsed: 10,
      workdaysRemaining: 10,
    })
    expect(inside.status).toBe('on-track')
    const outside = computePace({
      goal: 1_000_000,
      actual: 511_000,
      workdaysTotal: 20,
      workdaysElapsed: 10,
      workdaysRemaining: 10,
    })
    expect(outside.status).toBe('ahead')
  })

  it('uses a $1 floor for the tolerance band on tiny goals', () => {
    const pace = computePace({
      goal: 1000,
      actual: 260,
      workdaysTotal: 5,
      workdaysElapsed: 1,
      workdaysRemaining: 4,
    })
    expect(pace.expected).toBe(200)
    expect(pace.difference).toBe(60) // under $1, so still on-track
    expect(pace.status).toBe('on-track')
  })

  it('reports no-goal without inventing a comparison', () => {
    const pace = computePace({
      goal: null,
      actual: 74_200,
      workdaysTotal: 22,
      workdaysElapsed: 4,
      workdaysRemaining: 18,
    })
    expect(pace.status).toBe('no-goal')
    expect(pace.goal).toBeNull()
    expect(pace.actual).toBe(74_200)
    expect(pace.expected).toBe(0)
    expect(pace.difference).toBe(0)
    expect(pace.progress).toBe(0)
    expect(pace.requiredPerWorkday).toBeNull()
    expect(pace.workdaysTotal).toBe(22)
  })

  it('treats a zero goal as no goal', () => {
    expect(
      computePace({ goal: 0, actual: 100, workdaysTotal: 1, workdaysElapsed: 1, workdaysRemaining: 0 })
        .status,
    ).toBe('no-goal')
  })

  it('survives a period with no workdays at all', () => {
    const pace = computePace({
      goal: 1_000_000,
      actual: 0,
      workdaysTotal: 0,
      workdaysElapsed: 0,
      workdaysRemaining: 0,
    })
    expect(pace.expected).toBe(0)
    expect(pace.requiredPerWorkday).toBeNull()
    expect(pace.status).toBe('on-track')
  })

  it('returns null required-per-workday on the final workday', () => {
    const pace = computePace({
      goal: 1_000_000,
      actual: 900_000,
      workdaysTotal: 20,
      workdaysElapsed: 20,
      workdaysRemaining: 0,
    })
    expect(pace.expected).toBe(1_000_000)
    expect(pace.requiredPerWorkday).toBeNull()
    expect(pace.status).toBe('behind')
  })
})

describe('dailyPace', () => {
  const today = [
    makeSale({ amount: 38_900, date: '2026-09-04' }),
    makeSale({ amount: 21_400, date: '2026-09-04' }),
    makeSale({ amount: 13_900, date: '2026-09-04' }),
  ]

  it('produces the Home score card figures (spec §10)', () => {
    const pace = dailyPace(today, goals, settings, '2026-09-04')
    expect(pace.actual).toBe(74_200) // $742
    expect(pace.goal).toBe(50_000) // $500
    expect(pace.progress).toBeCloseTo(1.484, 10) // 148%
    expect(pace.difference).toBe(24_200) // +$242 above goal
    expect(pace.status).toBe('goal-reached')
  })

  it('expects nothing on a non-working day', () => {
    const saturday = dailyPace([makeSale({ amount: 10_000, date: '2026-09-05' })], goals, settings, '2026-09-05')
    expect(saturday.workdaysTotal).toBe(0)
    expect(saturday.expected).toBe(0)
    expect(saturday.status).toBe('ahead') // never behind on a day off
    const quietSaturday = dailyPace([], goals, settings, '2026-09-05')
    expect(quietSaturday.status).toBe('on-track')
  })

  it('falls back to no-goal when the daily goal is off', () => {
    const pace = dailyPace(today, [monthlyGoal], settings, '2026-09-04')
    expect(pace.status).toBe('no-goal')
    expect(pace.actual).toBe(74_200)
  })
})

describe('monthlyPace', () => {
  const septemberSales = [
    makeSale({ amount: 385_000, date: '2026-09-02' }),
    makeSale({ amount: 200_000, date: '2026-09-10' }),
  ]

  it('measures against configured workdays, not calendar days (spec §66)', () => {
    const pace = monthlyPace(septemberSales, goals, settings, '2026-09-15', '2026-09-15')
    expect(pace.workdaysTotal).toBe(22)
    expect(pace.workdaysElapsed).toBe(11)
    expect(pace.workdaysRemaining).toBe(11)
    expect(pace.actual).toBe(585_000)
    expect(pace.expected).toBe(500_000)
    expect(pace.difference).toBe(85_000)
    expect(pace.status).toBe('ahead')
    expect(pace.requiredPerWorkday).toBe(37_727) // $415,000 / 11
  })

  it('ignores sales from other months', () => {
    const noisy = [...septemberSales, makeSale({ amount: 999_000, date: '2026-08-31' })]
    expect(monthlyPace(noisy, goals, settings, '2026-09-15', '2026-09-15').actual).toBe(585_000)
  })

  it('counts a closed month as fully elapsed when reviewed later', () => {
    const pace = monthlyPace(septemberSales, goals, settings, '2026-09-15', '2026-12-01')
    expect(pace.workdaysElapsed).toBe(22)
    expect(pace.workdaysRemaining).toBe(0)
    expect(pace.expected).toBe(1_000_000)
    expect(pace.requiredPerWorkday).toBeNull()
    expect(pace.status).toBe('behind')
  })

  it('handles a month with no workdays configured', () => {
    const noWorkdays = makeSettings({ workdays: [] })
    const pace = monthlyPace(septemberSales, goals, noWorkdays, '2026-09-15', '2026-09-15')
    expect(pace.workdaysTotal).toBe(0)
    expect(pace.expected).toBe(0)
    expect(pace.requiredPerWorkday).toBeNull()
    expect(pace.progress).toBeCloseTo(0.585, 10)
  })

  it('respects excluded holidays', () => {
    const withHolidays = makeSettings({ excludedDates: ['2026-09-07', '2026-09-08'] })
    const pace = monthlyPace(septemberSales, goals, withHolidays, '2026-09-15', '2026-09-15')
    expect(pace.workdaysTotal).toBe(20)
    expect(pace.workdaysElapsed).toBe(9)
  })

  // Regression coverage for the bug where a monthly goal created mid-period,
  // with no earlier goal of its type, was measured against the WHOLE period's
  // workdays (via goalForPeriod's onboarding fallback) instead of just the
  // days since its own effectiveFrom — so a goal set minutes ago could read as
  // thousands of dollars "behind pace" against days that predate its own
  // existence. See goalPeriod.test.ts's "pace after onboarding mid-month" for
  // the companion goal-resolution coverage (goal amount, not workday window).
  describe('a goal created mid-period with no earlier goal of its type', () => {
    it("counts from the goal's own effectiveFrom, not the 1st, when that day is not a workday", () => {
      // $65,000/month goal created Saturday 2026-09-05 (not a workday); the
      // only September sale is the $568.99 recorded that same day. September
      // has 22 workdays from the 1st, but only 18 from the 5th onward — and
      // none of those 18 have elapsed yet, because the 5th itself is a
      // Saturday. (This is the exact live scenario the bug was found from.)
      const goal = makeGoal({ type: 'monthly', amount: 6_500_000, effectiveFrom: '2026-09-05' })
      const sale = [makeSale({ amount: 56_899, date: '2026-09-05' })]
      const pace = monthlyPace(sale, [goal], settings, '2026-09-05', '2026-09-05')
      expect(pace.goal).toBe(6_500_000)
      expect(pace.workdaysTotal).toBe(18) // Sep 5-30, not Sep 1-30 (22)
      expect(pace.workdaysElapsed).toBe(0) // the 5th is a Saturday
      expect(pace.workdaysRemaining).toBe(18)
      expect(pace.expected).toBe(0) // nothing was due before the goal existed
      expect(pace.difference).toBe(56_899) // the whole sale reads as a surplus
      expect(pace.status).toBe('ahead') // not "$11,249 behind" measured from Sep 1
      expect(pace.requiredPerWorkday).toBe(357_950) // unaffected: $6,443,101 / 18
    })

    it('counts from effectiveFrom when that day IS a workday', () => {
      // $17,000/month goal created Tuesday 2026-09-08; reviewed Thursday
      // 2026-09-10 with $3,500 recorded since. 17 workdays remain from the
      // 8th (not 22 from the 1st), and 3 of them (8th-10th) have elapsed.
      const goal = makeGoal({ type: 'monthly', amount: 1_700_000, effectiveFrom: '2026-09-08' })
      const sales = [makeSale({ amount: 350_000, date: '2026-09-09' })]
      const pace = monthlyPace(sales, [goal], settings, '2026-09-10', '2026-09-10')
      expect(pace.workdaysTotal).toBe(17)
      expect(pace.workdaysElapsed).toBe(3)
      expect(pace.workdaysRemaining).toBe(14)
      expect(pace.expected).toBe(300_000) // $17,000 x 3/17
      expect(pace.difference).toBe(50_000)
      expect(pace.status).toBe('ahead')
      expect(pace.requiredPerWorkday).toBe(96_429) // ($17,000 - $3,500) / 14
    })

    it('still measures from the period start when the goal already covered it — including a deliberate backdate', () => {
      // "Apply from the start of this month" stamps effectiveFrom at the 1st
      // on purpose (spec §32): that path must keep measuring the whole month,
      // not switch to "today onward" the way the onboarding fallback does.
      const backdated = makeGoal({ type: 'monthly', amount: 1_000_000, effectiveFrom: '2026-09-01' })
      const pace = monthlyPace(septemberSales, [backdated], settings, '2026-09-15', '2026-09-15')
      expect(pace.workdaysTotal).toBe(22)
      expect(pace.workdaysElapsed).toBe(11)
      expect(pace.expected).toBe(500_000)
      expect(pace.difference).toBe(85_000)
      expect(pace.status).toBe('ahead')
    })
  })
})

describe('annualPace', () => {
  it('runs on the working days of a leap year', () => {
    const leapGoal = makeGoal({ type: 'annual', amount: 12_000_000, effectiveFrom: '2024-01-01' })
    const sales = [makeSale({ amount: 6_000_000, date: '2024-06-28' })]
    const pace = annualPace(sales, [leapGoal], settings, '2024-06-28', '2024-06-28')
    expect(pace.workdaysTotal).toBe(262) // 366 days, starting on a Monday
    expect(pace.workdaysElapsed).toBe(130) // Jan 1 - Fri Jun 28
    expect(pace.actual).toBe(6_000_000)
    expect(pace.expected).toBe(5_954_198)
    expect(pace.status).toBe('on-track')
  })

  it('is fully elapsed at year end', () => {
    const sales = [makeSale({ amount: 8_342_000, date: '2026-05-01' })]
    const pace = annualPace(sales, goals, settings, '2026-05-01', '2026-12-31')
    expect(pace.workdaysElapsed).toBe(pace.workdaysTotal)
    expect(pace.expected).toBe(12_000_000)
    expect(pace.requiredPerWorkday).toBeNull()
    expect(pace.progress).toBeCloseTo(0.695, 3) // 69.5% (spec §11)
  })

  it('computes the required average for the remaining months (spec §68)', () => {
    const sales = [makeSale({ amount: 8_342_000, date: '2026-09-01' })]
    const pace = annualPace(sales, goals, settings, '2026-09-04', '2026-09-04')
    expect(monthsRemainingInYear('2026-09-04')).toBe(4) // Sep, Oct, Nov, Dec
    expect(requiredPerRemainingMonth(pace, '2026-09-04')).toBe(914_500)
  })

  it('has no remaining months once the year is over', () => {
    expect(monthsRemainingInYear('2027-01-01', '2026-06-01')).toBe(0)
    expect(monthsRemainingInYear('2025-01-01', '2026-06-01')).toBe(12)
  })

  it('measures a full year from Jan 1 when the annual goal already covered it (today, 2026-09-05)', () => {
    // Same backdated-vs-fresh distinction as monthlyPace, cross-checked against
    // the real current date: an annual goal in force since January must still
    // count every workday of the year, not just the days since it was read.
    const pace = annualPace([], goals, settings, '2026-09-05', '2026-09-05')
    expect(pace.workdaysTotal).toBe(261) // 2026 is not a leap year, starts Thursday
    expect(pace.workdaysElapsed).toBe(177) // Jan 1 - Fri Sep 4 (Sep 5 is a Saturday)
    expect(pace.workdaysRemaining).toBe(84)
  })

  // Regression coverage, mirroring monthlyPace: an annual goal created mid-year
  // with no earlier annual goal must not be measured against workdays that
  // predate its own effectiveFrom (spec §32, §69).
  describe('a goal created mid-period with no earlier goal of its type', () => {
    it('counts from effectiveFrom, not Jan 1', () => {
      // $83,000/year goal created Tuesday 2026-09-08; reviewed Thursday
      // 2026-09-10 with $3,500 recorded since. 83 workdays remain from the
      // 8th (not 261 from Jan 1), and 3 of them (8th-10th) have elapsed.
      const goal = makeGoal({ type: 'annual', amount: 8_300_000, effectiveFrom: '2026-09-08' })
      const sales = [makeSale({ amount: 350_000, date: '2026-09-09' })]
      const pace = annualPace(sales, [goal], settings, '2026-09-10', '2026-09-10')
      expect(pace.workdaysTotal).toBe(83)
      expect(pace.workdaysElapsed).toBe(3)
      expect(pace.workdaysRemaining).toBe(80)
      expect(pace.expected).toBe(300_000) // $83,000 x 3/83
      expect(pace.difference).toBe(50_000)
      expect(pace.status).toBe('ahead')
      expect(pace.requiredPerWorkday).toBe(99_375) // ($83,000 - $3,500) / 80
    })
  })
})

describe('shiftMonth', () => {
  it('navigates months from any day', () => {
    expect(shiftMonth('2026-09-15', -1)).toBe('2026-08-01')
    expect(shiftMonth('2026-12-31', 1)).toBe('2027-01-01')
  })
})

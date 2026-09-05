import {
  averagePerWorkday,
  bestDay,
  bestMonth,
  goalAttainment,
  goalStreak,
  largestSale,
  mostSalesInDay,
  personalRecords,
} from './records'
import { adjust, cancel, makeGoal, makeSale, makeSettings } from './fixtures'

const settings = makeSettings()
const dailyGoal = makeGoal({ type: 'daily', amount: 50_000, effectiveFrom: '2026-01-01' })

describe('personal records (spec §29)', () => {
  const sales = [
    makeSale({ amount: 100_000, date: '2026-06-03' }),
    makeSale({ amount: 20_000, date: '2026-06-03' }),
    makeSale({ amount: 124_000, date: '2026-07-14' }),
    makeSale({ amount: 148_200, date: '2026-08-21' }),
    makeSale({ amount: 10_000, date: '2026-08-22' }),
  ]

  it('finds the best day, best month, largest sale and busiest day', () => {
    const records = personalRecords(sales, [dailyGoal], settings, '2026-09-04')
    expect(records.bestDay).toEqual({ date: '2026-08-21', amount: 148_200 })
    expect(records.bestMonth).toEqual({ month: '2026-08', amount: 158_200 })
    expect(records.largestSale?.amount).toBe(148_200)
    expect(records.largestSale?.date).toBe('2026-08-21')
    expect(records.mostSalesInDay).toEqual({ date: '2026-06-03', count: 2 })
  })

  it('is null across the board with no sales', () => {
    const records = personalRecords([], [dailyGoal], settings, '2026-09-04')
    expect(records).toEqual({
      bestDay: null,
      bestMonth: null,
      largestSale: null,
      mostSalesInDay: null,
      goalStreak: 0,
    })
  })

  it('excludes cancelled sales from every record', () => {
    const withCancellation = [...sales, cancel(makeSale({ amount: 900_000, date: '2026-09-01' }))]
    const records = personalRecords(withCancellation, [dailyGoal], settings, '2026-09-04')
    expect(records.bestDay?.date).toBe('2026-08-21')
    expect(records.largestSale?.amount).toBe(148_200)
    expect(records.mostSalesInDay?.date).toBe('2026-06-03')
  })

  it('measures the largest sale on the amount that still stands', () => {
    const adjusted = [adjust(makeSale({ amount: 900_000, date: '2026-09-01' }), 30_000)]
    expect(largestSale(adjusted)?.amount).toBe(30_000)
  })

  it('awards ties to the earliest date — the record was set first', () => {
    const tied = [
      makeSale({ amount: 50_000, date: '2026-03-10' }),
      makeSale({ amount: 50_000, date: '2026-03-11' }),
    ]
    expect(bestDay(tied)?.date).toBe('2026-03-10')
    expect(largestSale(tied)?.date).toBe('2026-03-10')
    expect(mostSalesInDay(tied)?.date).toBe('2026-03-10')
    expect(bestMonth(tied)?.month).toBe('2026-03')
  })
})

describe('goal streak (spec §30)', () => {
  const hit = (date: string) => makeSale({ amount: 60_000, date })
  const miss = (date: string) => makeSale({ amount: 10_000, date })

  it('skips weekends instead of breaking on them (spec §77 Working Day Test)', () => {
    // Hit Wed, Thu, Fri; quiet Sat and Sun; hit again Monday.
    const sales = [hit('2026-09-02'), hit('2026-09-03'), hit('2026-09-04'), hit('2026-09-07')]
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-07')).toBe(4)
  })

  it('skips excluded holidays too', () => {
    const withHoliday = makeSettings({ excludedDates: ['2026-09-07'] })
    const sales = [hit('2026-09-04'), hit('2026-09-08')]
    expect(goalStreak(sales, [dailyGoal], withHoliday, '2026-09-08')).toBe(2)
  })

  it('breaks on a workday that missed the goal', () => {
    const sales = [hit('2026-09-02'), miss('2026-09-03'), hit('2026-09-04')]
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-04')).toBe(1)
  })

  it('breaks on a workday with no sales at all', () => {
    const sales = [hit('2026-09-02'), hit('2026-09-04')]
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-04')).toBe(1)
  })

  it('does not punish today for still being in progress', () => {
    // Yesterday hit, today has only $100 on the board so far.
    const sales = [hit('2026-09-02'), hit('2026-09-03'), miss('2026-09-04')]
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-04')).toBe(2)
  })

  it('counts today once it lands', () => {
    const sales = [hit('2026-09-03'), hit('2026-09-04')]
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-04')).toBe(2)
  })

  it('counts a day that exactly meets the goal', () => {
    const sales = [makeSale({ amount: 50_000, date: '2026-09-04' })]
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-04')).toBe(1)
  })

  it('ignores cancelled sales when deciding whether the goal was hit', () => {
    const sales = [hit('2026-09-03'), cancel(makeSale({ amount: 60_000, date: '2026-09-04' }))]
    // Thursday hit, Friday cancelled to zero: the streak stops at Thursday
    // (Friday is today, still in progress, so it does not reset it).
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-04')).toBe(1)
    // By Monday, Friday counts as a real miss.
    expect(goalStreak(sales, [dailyGoal], settings, '2026-09-07')).toBe(0)
  })

  it('is 0 when no daily goal is in force', () => {
    expect(goalStreak([hit('2026-09-04')], [], settings, '2026-09-04')).toBe(0)
    const disabled = makeGoal({
      type: 'daily',
      amount: 50_000,
      effectiveFrom: '2026-01-01',
      enabled: false,
    })
    expect(goalStreak([hit('2026-09-04')], [disabled], settings, '2026-09-04')).toBe(0)
  })

  it('skips days the goal did not exist rather than counting them as misses', () => {
    const started = makeGoal({ type: 'daily', amount: 50_000, effectiveFrom: '2026-09-04' })
    const sales = [hit('2026-09-02'), hit('2026-09-04')]
    // Wed 2 Sep had no goal to miss, so only Friday counts.
    expect(goalStreak(sales, [started], settings, '2026-09-04')).toBe(1)
  })

  it('respects a goal that changed mid-streak', () => {
    const cheap = makeGoal({
      type: 'daily',
      amount: 50_000,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-09-03',
      createdAt: 1,
    })
    const raised = makeGoal({
      type: 'daily',
      amount: 100_000,
      effectiveFrom: '2026-09-04',
      createdAt: 2,
    })
    const sales = [hit('2026-09-02'), hit('2026-09-03'), hit('2026-09-04')]
    // Friday's $600 no longer clears the new $1,000 bar, but Friday is today.
    expect(goalStreak(sales, [cheap, raised], settings, '2026-09-04')).toBe(2)
    expect(goalStreak(sales, [cheap, raised], settings, '2026-09-07')).toBe(0)
  })

  it('is 0 when no days are configured as workdays', () => {
    const none = makeSettings({ workdays: [] })
    expect(goalStreak([hit('2026-09-04')], [dailyGoal], none, '2026-09-04')).toBe(0)
  })

  it('terminates quickly on a long history', () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      makeSale({ amount: 60_000, date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15` }),
    )
    const started = performance.now()
    goalStreak(many, [dailyGoal], settings, '2026-12-31')
    expect(performance.now() - started).toBeLessThan(50)
  })
})

describe('goal attainment and per-workday average (spec §27)', () => {
  const sales = [
    makeSale({ amount: 60_000, date: '2026-09-01' }),
    makeSale({ amount: 60_000, date: '2026-09-02' }),
    makeSale({ amount: 10_000, date: '2026-09-03' }),
  ]

  it('scores hits against the workdays that had a goal', () => {
    const result = goalAttainment(sales, [dailyGoal], settings, {
      from: '2026-09-01',
      to: '2026-09-04',
    })
    expect(result.workdays).toBe(4)
    expect(result.hits).toBe(2)
    expect(result.rate).toBe(0.5)
  })

  it('ignores weekends in the denominator', () => {
    const result = goalAttainment(sales, [dailyGoal], settings, {
      from: '2026-09-01',
      to: '2026-09-06',
    })
    expect(result.workdays).toBe(4) // Tue-Fri; Sat and Sun do not count
  })

  it('is zero-safe with no goal in force', () => {
    const result = goalAttainment(sales, [], settings, { from: '2026-09-01', to: '2026-09-04' })
    expect(result).toEqual({ workdays: 0, hits: 0, rate: 0 })
  })

  it('averages net sales across working days', () => {
    expect(averagePerWorkday(sales, settings, { from: '2026-09-01', to: '2026-09-04' })).toBe(32_500)
    expect(averagePerWorkday(sales, makeSettings({ workdays: [] }), {
      from: '2026-09-01',
      to: '2026-09-04',
    })).toBe(0)
  })
})

import { dailySeries, monthCalendar, monthlySeries, weeklySeries } from './trends'
import { adjust, cancel, makeSale } from './fixtures'

const EN = { locale: 'en-US' }

describe('dailySeries (spec §28)', () => {
  const sales = [
    makeSale({ amount: 38_900, date: '2026-09-01' }),
    makeSale({ amount: 21_400, date: '2026-09-01' }),
    makeSale({ amount: 13_900, date: '2026-09-04' }),
  ]

  it('zero-fills every day in the range', () => {
    const series = dailySeries(sales, '2026-09-01', '2026-09-05', EN)
    expect(series).toHaveLength(5)
    expect(series.map((point) => point.key)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ])
    expect(series.map((point) => point.netSales)).toEqual([60_300, 0, 0, 13_900, 0])
    expect(series.map((point) => point.saleCount)).toEqual([2, 0, 0, 1, 0])
  })

  it('labels points for a 360px axis', () => {
    const series = dailySeries(sales, '2026-09-01', '2026-09-02', EN)
    expect(series[0].label).toBe('Sep 1')
    expect(series[1].label).toBe('Sep 2')
  })

  it('ignores sales outside the range', () => {
    const series = dailySeries(sales, '2026-09-02', '2026-09-03', EN)
    expect(series.map((point) => point.netSales)).toEqual([0, 0])
  })

  it('returns nothing for an inverted range', () => {
    expect(dailySeries(sales, '2026-09-05', '2026-09-01', EN)).toEqual([])
  })

  it('handles a single-day range', () => {
    expect(dailySeries(sales, '2026-09-01', '2026-09-01', EN)).toHaveLength(1)
  })

  it('spans a leap day without a gap', () => {
    const leap = [makeSale({ amount: 10_000, date: '2024-02-29' })]
    const series = dailySeries(leap, '2024-02-27', '2024-03-01', EN)
    expect(series.map((point) => point.key)).toEqual([
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ])
    expect(series[2].netSales).toBe(10_000)
  })

  it('nets out cancellations and adjustments', () => {
    const mixed = [
      cancel(makeSale({ amount: 50_000, date: '2026-09-01' })),
      adjust(makeSale({ amount: 50_000, date: '2026-09-02' }), 20_000),
    ]
    const series = dailySeries(mixed, '2026-09-01', '2026-09-02', EN)
    expect(series[0].netSales).toBe(0)
    expect(series[0].saleCount).toBe(0)
    expect(series[1].netSales).toBe(20_000)
    expect(series[1].saleCount).toBe(1)
  })
})

describe('weeklySeries', () => {
  const sales = [
    makeSale({ amount: 10_000, date: '2026-09-01' }), // week of Mon 31 Aug
    makeSale({ amount: 20_000, date: '2026-09-06' }), // Sunday, same week
    makeSale({ amount: 30_000, date: '2026-09-07' }), // week of Mon 7 Sep
  ]

  it('buckets by week start and zero-fills quiet weeks', () => {
    const series = weeklySeries(sales, '2026-09-01', '2026-09-21', 1, EN)
    expect(series.map((point) => point.key)).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
    ])
    expect(series.map((point) => point.netSales)).toEqual([30_000, 30_000, 0, 0])
  })

  it('honours a Sunday week start', () => {
    const series = weeklySeries(sales, '2026-09-01', '2026-09-08', 0, EN)
    expect(series[0].key).toBe('2026-08-30')
    expect(series.map((point) => point.netSales)).toEqual([10_000, 50_000])
  })

  it('returns nothing for an inverted range', () => {
    expect(weeklySeries(sales, '2026-09-21', '2026-09-01', 1, EN)).toEqual([])
  })
})

describe('monthlySeries (spec §25)', () => {
  const sales = [
    makeSale({ amount: 920_000, date: '2026-01-15' }),
    makeSale({ amount: 1_030_000, date: '2026-02-15' }),
    makeSale({ amount: 890_000, date: '2026-03-15' }),
    makeSale({ amount: 500_000, date: '2025-06-15' }), // previous year
  ]

  it('always returns twelve zero-filled months', () => {
    const series = monthlySeries(sales, 2026, EN)
    expect(series).toHaveLength(12)
    expect(series.map((point) => point.key)[0]).toBe('2026-01')
    expect(series.map((point) => point.key)[11]).toBe('2026-12')
    expect(series.map((point) => point.label)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ])
    expect(series.map((point) => point.netSales)).toEqual([
      920_000, 1_030_000, 890_000, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
  })

  it('never leaks another year into the chart', () => {
    const previous = monthlySeries(sales, 2025, EN)
    expect(previous[5].netSales).toBe(500_000)
    expect(previous.reduce((sum, point) => sum + point.netSales, 0)).toBe(500_000)
  })

  it('is all zeroes for a year with no sales', () => {
    const series = monthlySeries(sales, 2024, EN)
    expect(series).toHaveLength(12)
    expect(series.every((point) => point.netSales === 0 && point.saleCount === 0)).toBe(true)
  })
})

describe('monthCalendar (spec §22)', () => {
  it('covers every day of the month, zero-filled', () => {
    const sales = [
      makeSale({ amount: 42_000, date: '2026-09-01' }),
      makeSale({ amount: 74_200, date: '2026-09-04' }),
    ]
    const days = monthCalendar(sales, '2026-09-15')
    expect(days).toHaveLength(30)
    expect(days[0]).toEqual({
      date: '2026-09-01',
      weekday: 2, // Tuesday
      netSales: 42_000,
      saleCount: 1,
    })
    expect(days[1].netSales).toBe(0)
    expect(days[3].netSales).toBe(74_200)
  })

  it('handles a leap February', () => {
    expect(monthCalendar([], '2024-02-10')).toHaveLength(29)
    expect(monthCalendar([], '2026-02-10')).toHaveLength(28)
  })
})

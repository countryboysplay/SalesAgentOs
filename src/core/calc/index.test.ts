import * as calc from './index'

describe('calc barrel', () => {
  it('exposes the selectors screens are allowed to use', () => {
    for (const name of [
      'goalFor',
      'goalAmountFor',
      'totalsFor',
      'totalsForDay',
      'totalsForMonth',
      'totalsForYear',
      'dailyPace',
      'monthlyPace',
      'annualPace',
      'personalRecords',
      'goalStreak',
      'categoryPerformance',
      'dailySeries',
      'weeklySeries',
      'monthlySeries',
      'monthCalendar',
    ] as const) {
      expect(typeof calc[name]).toBe('function')
    }
  })
})

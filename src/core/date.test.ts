import {
  addDays,
  addMonths,
  countWorkdays,
  daysBetween,
  daysInMonth,
  daysInRange,
  endOfMonth,
  endOfWeek,
  formatDayLabel,
  formatMonthLabel,
  fromIso,
  isValidIso,
  isWorkday,
  isoForYear,
  monthKey,
  monthKeyToIso,
  monthWorkdays,
  nowTime,
  previousWorkday,
  startOfMonth,
  startOfWeek,
  startOfYear,
  endOfYear,
  toIso,
  todayIso,
  weekdayOf,
  workdaysElapsedInMonth,
  workdaysElapsedInYear,
  workdaysInMonth,
  workdaysInYear,
  workdaysRemainingInMonth,
  workdaysRemainingInYear,
  yearWorkdays,
} from './date'
import { makeSettings } from './calc/fixtures'

const MON_FRI = makeSettings()

describe('local date conversion', () => {
  it('formats a Date as a LOCAL day, never UTC', () => {
    expect(toIso(new Date(2026, 8, 4, 9, 14))).toBe('2026-09-04')
  })

  it('keeps a 23:59 sale on its own local day', () => {
    // The UTC date here is Sept 5 for anyone east of GMT; the local day is what counts.
    expect(toIso(new Date(2026, 8, 4, 23, 59, 59))).toBe('2026-09-04')
    expect(todayIso(new Date(2026, 8, 4, 23, 59, 59))).toBe('2026-09-04')
    expect(nowTime(new Date(2026, 8, 4, 23, 59))).toBe('23:59')
  })

  it('keeps a 00:00 sale on its own local day', () => {
    expect(todayIso(new Date(2026, 8, 4, 0, 0, 0))).toBe('2026-09-04')
  })

  it('round-trips through fromIso', () => {
    const d = fromIso('2026-09-04')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(4)
    expect(toIso(d)).toBe('2026-09-04')
  })

  it('validates iso strings', () => {
    expect(isValidIso('2026-09-04')).toBe(true)
    expect(isValidIso('2024-02-29')).toBe(true)
    expect(isValidIso('2025-02-29')).toBe(false)
    expect(isValidIso('2026-13-01')).toBe(false)
    expect(isValidIso('2026-9-4')).toBe(false)
    expect(isValidIso('not a date')).toBe(false)
    expect(isValidIso(20260904)).toBe(false)
  })

  it('throws on malformed input rather than silently drifting', () => {
    expect(() => fromIso('2026-9-4')).toThrow()
    expect(() => monthKeyToIso('2026-9')).toThrow()
  })
})

describe('date arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-04', 1)).toBe('2026-09-05')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-09-04', 0)).toBe('2026-09-04')
  })

  it('handles leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01')
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2023, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29) // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28) // divisible by 100 but not 400
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(daysInRange('2024-01-01', '2024-12-31')).toHaveLength(366)
    expect(daysInRange('2026-01-01', '2026-12-31')).toHaveLength(365)
  })

  it('clamps when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-09-04', -9)).toBe('2025-12-04')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('produces period bounds', () => {
    expect(startOfMonth('2026-09-04')).toBe('2026-09-01')
    expect(endOfMonth('2026-09-04')).toBe('2026-09-30')
    expect(startOfYear('2026-09-04')).toBe('2026-01-01')
    expect(endOfYear('2026-09-04')).toBe('2026-12-31')
    expect(monthKey('2026-09-04')).toBe('2026-09')
    expect(monthKeyToIso('2026-09')).toBe('2026-09-01')
    expect(isoForYear(2026)).toBe('2026-01-01')
  })

  it('knows weekdays and week bounds', () => {
    expect(weekdayOf('2026-09-04')).toBe(5) // Friday
    expect(weekdayOf('2026-09-06')).toBe(0) // Sunday
    expect(startOfWeek('2026-09-04', 1)).toBe('2026-08-31')
    expect(endOfWeek('2026-09-04', 1)).toBe('2026-09-06')
    expect(startOfWeek('2026-09-04', 0)).toBe('2026-08-30')
  })

  it('lists inclusive ranges and rejects inverted ones', () => {
    expect(daysInRange('2026-09-01', '2026-09-03')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ])
    expect(daysInRange('2026-09-03', '2026-09-01')).toEqual([])
    expect(daysInRange('2026-09-01', '2026-09-01')).toEqual(['2026-09-01'])
    expect(daysBetween('2026-09-01', '2026-09-04')).toBe(3)
    expect(daysBetween('2026-09-04', '2026-09-01')).toBe(-3)
  })
})

describe('DST safety', () => {
  // Adding 86_400_000ms breaks on the 23- and 25-hour days. These sweeps run in
  // whatever timezone the machine is in, so they catch it wherever it happens.
  it('advances exactly one calendar day on every day of a leap year', () => {
    const days = daysInRange('2024-01-01', '2024-12-31')
    expect(days).toHaveLength(366)
    for (let i = 0; i < days.length - 1; i += 1) {
      expect(addDays(days[i], 1)).toBe(days[i + 1])
      expect(addDays(days[i + 1], -1)).toBe(days[i])
      expect(daysBetween(days[i], days[i + 1])).toBe(1)
    }
    expect(new Set(days).size).toBe(366)
  })

  it('survives the local timezone transitions, wherever they fall', () => {
    const days = daysInRange('2026-01-01', '2026-12-31')
    const transitions = days.filter((day, i) => {
      if (i === 0) return false
      return fromIso(day).getTimezoneOffset() !== fromIso(days[i - 1]).getTimezoneOffset()
    })
    // In a zone with no DST this list is empty and the sweep above still guards us.
    for (const day of transitions) {
      expect(addDays(addDays(day, -1), 1)).toBe(day)
      expect(toIso(fromIso(day))).toBe(day)
      expect(daysBetween(addDays(day, -1), day)).toBe(1)
    }
  })

  it('keeps month and year bounds stable across transitions', () => {
    for (const day of daysInRange('2026-03-01', '2026-03-31')) {
      expect(startOfMonth(day)).toBe('2026-03-01')
      expect(endOfMonth(day)).toBe('2026-03-31')
    }
    for (const day of daysInRange('2026-11-01', '2026-11-30')) {
      expect(startOfMonth(day)).toBe('2026-11-01')
      expect(endOfMonth(day)).toBe('2026-11-30')
    }
  })
})

describe('workdays', () => {
  it('counts only configured days', () => {
    expect(isWorkday('2026-09-04', MON_FRI.workdays)).toBe(true) // Friday
    expect(isWorkday('2026-09-05', MON_FRI.workdays)).toBe(false) // Saturday
    expect(isWorkday('2026-09-06', MON_FRI.workdays)).toBe(false) // Sunday
    expect(isWorkday('2026-09-07', MON_FRI.workdays, ['2026-09-07'])).toBe(false) // holiday
    expect(isWorkday('2026-09-07', MON_FRI.workdays, new Set(['2026-09-07']))).toBe(false)
  })

  it('counts September 2026 as 22 working days', () => {
    expect(countWorkdays('2026-09-01', '2026-09-30', MON_FRI)).toBe(22)
    expect(workdaysInMonth('2026-09-15', MON_FRI)).toBe(22)
  })

  it('subtracts excluded dates', () => {
    const withHolidays = makeSettings({ excludedDates: ['2026-09-07', '2026-09-08'] })
    expect(countWorkdays('2026-09-01', '2026-09-30', withHolidays)).toBe(20)
    // Excluding a Saturday changes nothing — it was never a workday.
    const weekendHoliday = makeSettings({ excludedDates: ['2026-09-05'] })
    expect(countWorkdays('2026-09-01', '2026-09-30', weekendHoliday)).toBe(22)
  })

  it('handles a month with zero workdays configured', () => {
    const none = makeSettings({ workdays: [] })
    expect(countWorkdays('2026-09-01', '2026-09-30', none)).toBe(0)
    const budget = monthWorkdays('2026-09-15', none)
    expect(budget).toEqual({ total: 0, elapsed: 0, remaining: 0 })
    expect(previousWorkday('2026-09-15', none)).toBeNull()
  })

  it('handles every day being excluded', () => {
    const allOff = makeSettings({ excludedDates: daysInRange('2026-09-01', '2026-09-30') })
    expect(countWorkdays('2026-09-01', '2026-09-30', allOff)).toBe(0)
  })

  it('counts the day in progress as elapsed and the rest as remaining', () => {
    // Tue 15 Sep 2026: 1-4 (4) + 7-11 (5) + 14,15 (2) = 11 elapsed of 22.
    expect(workdaysElapsedInMonth('2026-09-15', MON_FRI)).toBe(11)
    expect(workdaysRemainingInMonth('2026-09-15', MON_FRI)).toBe(11)
    const budget = monthWorkdays('2026-09-15', MON_FRI)
    expect(budget.elapsed + budget.remaining).toBe(budget.total)
  })

  it('treats a weekend as no further progress', () => {
    // Sat 5 Sep and Fri 4 Sep sit on the same elapsed count.
    expect(workdaysElapsedInMonth('2026-09-04', MON_FRI)).toBe(4)
    expect(workdaysElapsedInMonth('2026-09-05', MON_FRI)).toBe(4)
    expect(workdaysElapsedInMonth('2026-09-06', MON_FRI)).toBe(4)
  })

  it('reaches 100% elapsed on the last workday and stays there', () => {
    expect(workdaysElapsedInMonth('2026-09-30', MON_FRI)).toBe(22) // Wed 30th
    expect(workdaysRemainingInMonth('2026-09-30', MON_FRI)).toBe(0)
    // Reviewing September from October: everything elapsed, nothing remaining.
    expect(workdaysElapsedInMonth('2026-10-15', MON_FRI, '2026-09-01')).toBe(22)
    expect(workdaysRemainingInMonth('2026-10-15', MON_FRI, '2026-09-01')).toBe(0)
  })

  it('reports nothing elapsed for a future period', () => {
    expect(workdaysElapsedInMonth('2026-08-31', MON_FRI, '2026-09-01')).toBe(0)
    expect(workdaysRemainingInMonth('2026-08-31', MON_FRI, '2026-09-01')).toBe(22)
  })

  it('counts a leap year at 262 working days', () => {
    expect(workdaysInYear('2024-06-01', MON_FRI)).toBe(262)
    expect(workdaysInYear('2026-06-01', MON_FRI)).toBe(261)
    const budget = yearWorkdays('2024-06-01', MON_FRI, '2024-12-31')
    expect(budget.elapsed).toBe(262)
    expect(workdaysElapsedInYear('2024-01-01', MON_FRI)).toBe(1) // Mon 1 Jan 2024
    expect(workdaysRemainingInYear('2024-01-01', MON_FRI)).toBe(261)
  })

  it('walks back to the previous workday over a weekend', () => {
    expect(previousWorkday('2026-09-07', MON_FRI)).toBe('2026-09-04') // Mon -> Fri
    expect(previousWorkday('2026-09-04', MON_FRI)).toBe('2026-09-03')
    const withHoliday = makeSettings({ excludedDates: ['2026-09-04'] })
    expect(previousWorkday('2026-09-07', withHoliday)).toBe('2026-09-03')
  })
})

describe('labels', () => {
  it('renders compact axis labels', () => {
    expect(formatDayLabel('2026-09-04', 'en-US')).toBe('Sep 4')
    expect(formatMonthLabel('2026-01-01', 'en-US')).toBe('Jan')
    expect(formatMonthLabel('2026-12-01', 'en-US')).toBe('Dec')
  })
})

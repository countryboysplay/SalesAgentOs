import {
  EM_DASH,
  formatBasisPoints,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatDateTime,
  formatMonthKey,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  formatTime,
} from './format'
import { FORMAT } from './calc/fixtures'

describe('formatCurrency', () => {
  it('hides cents on whole dollars, shows them when they matter', () => {
    expect(formatCurrency(74_200, FORMAT)).toBe('$742')
    expect(formatCurrency(785_000, FORMAT)).toBe('$7,850')
    expect(formatCurrency(23_889, FORMAT)).toBe('$238.89')
    expect(formatCurrency(3710, FORMAT)).toBe('$37.10')
    expect(formatCurrency(0, FORMAT)).toBe('$0')
  })

  it('can be forced either way', () => {
    expect(formatCurrency(74_200, FORMAT, { decimals: 'always' })).toBe('$742.00')
    expect(formatCurrency(23_889, FORMAT, { decimals: 'never' })).toBe('$239')
  })

  it('formats negatives and non-numbers safely', () => {
    expect(formatCurrency(-43_800, FORMAT)).toBe('-$438')
    expect(formatCurrency(Number.NaN, FORMAT)).toBe(EM_DASH)
  })

  it('honours the configured currency and locale', () => {
    expect(formatCurrency(74_200, { currency: 'EUR', locale: 'de-DE' })).toContain('742')
    expect(formatCurrency(74_200, { currency: 'EUR', locale: 'de-DE' })).toContain('€')
  })

  it('defaults to USD when settings are missing', () => {
    expect(formatCurrency(74_200)).toBe('$742')
  })

  it('compacts for chart axes (spec §25)', () => {
    expect(formatCurrencyCompact(920_000, FORMAT)).toBe('$9.2K')
    expect(formatCurrencyCompact(1_030_000, FORMAT)).toBe('$10.3K')
    expect(formatCurrencyCompact(100_000, FORMAT)).toBe('$1K')
    expect(formatCurrencyCompact(50_000, FORMAT)).toBe('$500')
    expect(formatCurrencyCompact(0, FORMAT)).toBe('$0')
  })
})

describe('formatSignedCurrency', () => {
  it('renders the above/below-goal figure (spec §10, §52)', () => {
    expect(formatSignedCurrency(24_200, FORMAT)).toBe('+$242')
    expect(formatSignedCurrency(-43_800, FORMAT)).toBe('-$438')
    expect(formatSignedCurrency(0, FORMAT)).toBe('$0')
    expect(formatSignedCurrency(61_200, FORMAT)).toBe('+$612')
  })
})

describe('formatPercent', () => {
  it('keeps progress readable past 100% (spec §51)', () => {
    expect(formatPercent(0.785, FORMAT)).toBe('78.5%')
    expect(formatPercent(1.48, FORMAT)).toBe('148%')
    expect(formatPercent(1.24, FORMAT)).toBe('124%')
    expect(formatPercent(0.695, FORMAT)).toBe('69.5%')
    expect(formatPercent(0, FORMAT)).toBe('0%')
    expect(formatPercent(Number.NaN, FORMAT)).toBe(EM_DASH)
  })
})

describe('formatBasisPoints', () => {
  it('renders rates the way the settings screen states them', () => {
    expect(formatBasisPoints(500, FORMAT)).toBe('5%')
    expect(formatBasisPoints(300, FORMAT)).toBe('3%')
    expect(formatBasisPoints(325, FORMAT)).toBe('3.25%')
    expect(formatBasisPoints(0, FORMAT)).toBe('0%')
  })
})

describe('formatNumber', () => {
  it('groups counts', () => {
    expect(formatNumber(1482, FORMAT)).toBe('1,482')
    expect(formatNumber(3, FORMAT)).toBe('3')
  })
})

describe('formatDate', () => {
  it('covers the styles the spec uses', () => {
    expect(formatDate('2026-09-04', FORMAT, 'weekday')).toBe('Friday, September 4')
    expect(formatDate('2026-09-04', FORMAT, 'full')).toBe('Friday, September 4, 2026')
    expect(formatDate('2026-09-04', FORMAT, 'long')).toBe('September 4, 2026')
    expect(formatDate('2026-09-04', FORMAT, 'medium')).toBe('Sep 4, 2026')
    expect(formatDate('2026-09-04', FORMAT, 'short')).toBe('Sep 4')
    expect(formatDate('2026-09-04', FORMAT, 'monthYear')).toBe('September 2026')
    expect(formatMonthKey('2026-06', FORMAT)).toBe('June 2026')
  })

  it('never throws on a malformed date', () => {
    expect(formatDate('nonsense', FORMAT)).toBe(EM_DASH)
  })
})

describe('formatTime', () => {
  it('renders a 12-hour clock (spec §13)', () => {
    expect(formatTime('09:14')).toBe('9:14 AM')
    expect(formatTime('11:42')).toBe('11:42 AM')
    expect(formatTime('14:07')).toBe('2:07 PM')
    expect(formatTime('00:05')).toBe('12:05 AM')
    expect(formatTime('12:00')).toBe('12:00 PM')
    expect(formatTime('23:59')).toBe('11:59 PM')
    expect(formatTime('09:14:33')).toBe('9:14 AM')
  })

  it('leaves unparseable input visible rather than blanking it', () => {
    expect(formatTime('nope')).toBe('nope')
    expect(formatTime('25:00')).toBe('25:00')
  })

  it('combines date and time', () => {
    expect(formatDateTime('2026-09-04', '09:14', FORMAT)).toBe('Sep 4, 2026 · 9:14 AM')
  })
})

/**
 * SalesTrack — display formatting.
 *
 * This module is the render boundary: cents and fractions go in, strings come
 * out. Nothing here is ever fed back into state or into another calculation.
 */
import { centsToNumber } from './money'
import { fromIso } from './date'
import type { BasisPoints, Cents, IsoDate, IsoTime, Settings } from './types'

/** The slice of Settings formatting needs. */
export type FormatSettings = Pick<Settings, 'currency' | 'locale'>

const DEFAULT_FORMAT: FormatSettings = { currency: 'USD', locale: 'en-US' }

/** Placeholder for a value that cannot be rendered (NaN, missing input). */
export const EM_DASH = '—'

// Intl formatters are expensive to construct and get hit once per ledger row,
// so they are memoised by their full option signature.
const numberFormatters = new Map<string, Intl.NumberFormat>()

function numberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let formatter = numberFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    numberFormatters.set(key, formatter)
  }
  return formatter
}

function resolve(settings?: FormatSettings): FormatSettings {
  if (!settings) return DEFAULT_FORMAT
  return {
    currency: settings.currency || DEFAULT_FORMAT.currency,
    locale: settings.locale || DEFAULT_FORMAT.locale,
  }
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/**
 * `auto` hides the cents on whole-dollar amounts, which is what the spec shows
 * everywhere ($742, $7,850) while still printing $238.89 when it matters.
 */
export type CurrencyDecimals = 'auto' | 'always' | 'never'

export interface CurrencyOptions {
  decimals?: CurrencyDecimals
  /** Compact notation for chart axes: $9.2K (spec §25). */
  compact?: boolean
}

export function formatCurrency(
  cents: Cents,
  settings?: FormatSettings,
  options: CurrencyOptions = {},
): string {
  if (!Number.isFinite(cents)) return EM_DASH
  const { currency, locale } = resolve(settings)
  const { decimals = 'auto', compact = false } = options

  if (compact) {
    return numberFormatter(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      compactDisplay: 'short',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(centsToNumber(cents))
  }

  const showCents = decimals === 'always' || (decimals === 'auto' && cents % 100 !== 0)
  const fractionDigits = decimals === 'never' ? 0 : showCents ? 2 : 0
  return numberFormatter(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(centsToNumber(cents))
}

/** Chart-axis currency: $9.2K, $1.4M (spec §25). */
export function formatCurrencyCompact(cents: Cents, settings?: FormatSettings): string {
  return formatCurrency(cents, settings, { compact: true })
}

/** '+$242' / '-$438' / '$0' — the above/below-goal figure (spec §10, §52). */
export function formatSignedCurrency(
  cents: Cents,
  settings?: FormatSettings,
  options: CurrencyOptions = {},
): string {
  if (!Number.isFinite(cents)) return EM_DASH
  const magnitude = formatCurrency(Math.abs(cents), settings, options)
  if (cents > 0) return `+${magnitude}`
  if (cents < 0) return `-${magnitude}`
  return magnitude
}

// ---------------------------------------------------------------------------
// Numbers & percentages
// ---------------------------------------------------------------------------

/** Plain count with group separators: 1,482 sales. */
export function formatNumber(value: number, settings?: FormatSettings): string {
  if (!Number.isFinite(value)) return EM_DASH
  return numberFormatter(resolve(settings).locale, { maximumFractionDigits: 0 }).format(value)
}

/**
 * Fraction -> percent string. 0.785 -> '78.5%', 1.24 -> '124%'.
 * Uncapped by design: progress past goal must stay readable (spec §51).
 */
export function formatPercent(
  fraction: number,
  settings?: FormatSettings,
  maximumFractionDigits = 1,
): string {
  if (!Number.isFinite(fraction)) return EM_DASH
  return numberFormatter(resolve(settings).locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(fraction)
}

/** 500bp -> '5%', 325bp -> '3.25%'. */
export function formatBasisPoints(basisPoints: BasisPoints, settings?: FormatSettings): string {
  if (!Number.isFinite(basisPoints)) return EM_DASH
  return numberFormatter(resolve(settings).locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(basisPoints / 10_000)
}

// ---------------------------------------------------------------------------
// Dates & times
// ---------------------------------------------------------------------------

export type DateStyle =
  /** Friday, September 4, 2026 */
  | 'full'
  /** Friday, September 4 — the Home header (spec §9) */
  | 'weekday'
  /** September 4, 2026 (spec §40) */
  | 'long'
  /** Sep 4, 2026 */
  | 'medium'
  /** Sep 4 */
  | 'short'
  /** September 2026 (spec §21) */
  | 'monthYear'
  /** Sep 2026 */
  | 'monthYearShort'

const DATE_STYLE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  weekday: { weekday: 'long', month: 'long', day: 'numeric' },
  long: { month: 'long', day: 'numeric', year: 'numeric' },
  medium: { month: 'short', day: 'numeric', year: 'numeric' },
  short: { month: 'short', day: 'numeric' },
  monthYear: { month: 'long', year: 'numeric' },
  monthYearShort: { month: 'short', year: 'numeric' },
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

function dateFormatter(locale: string, style: DateStyle): Intl.DateTimeFormat {
  const key = `${locale}|${style}`
  let formatter = dateFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, DATE_STYLE_OPTIONS[style])
    dateFormatters.set(key, formatter)
  }
  return formatter
}

export function formatDate(
  date: IsoDate,
  settings?: FormatSettings,
  style: DateStyle = 'medium',
): string {
  try {
    return dateFormatter(resolve(settings).locale, style).format(fromIso(date))
  } catch {
    return EM_DASH
  }
}

/** 'YYYY-MM' -> 'September 2026'. */
export function formatMonthKey(
  key: string,
  settings?: FormatSettings,
  style: DateStyle = 'monthYear',
): string {
  return formatDate(`${key}-01`, settings, style)
}

const TIME_RE = /^(\d{1,2}):(\d{2})/

/**
 * 'HH:mm' -> '9:14 AM'.
 *
 * Deliberately hand-rolled rather than Intl: recent ICU versions put a narrow
 * no-break space before AM/PM, which looks broken in the compact ledger rows and
 * makes the output drift between browsers. Unparseable input is returned
 * untouched so a bad row is visible rather than silently blanked.
 */
export function formatTime(time: IsoTime): string {
  if (typeof time !== 'string') return EM_DASH
  const m = TIME_RE.exec(time.trim())
  if (!m) return time
  const hours24 = Number(m[1])
  const minutes = Number(m[2])
  if (hours24 > 23 || minutes > 59) return time
  const suffix = hours24 < 12 ? 'AM' : 'PM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/** '2026-09-04' + '09:14' -> 'Sep 4, 2026 · 9:14 AM'. */
export function formatDateTime(
  date: IsoDate,
  time: IsoTime,
  settings?: FormatSettings,
  style: DateStyle = 'medium',
): string {
  return `${formatDate(date, settings, style)} · ${formatTime(time)}`
}

/**
 * Period totals — gross, cancellations, net, average, commission (spec §18, §65).
 *
 * The invariant this file guarantees:
 *
 *     netSales === grossSales - cancelledSales === sum of effective amounts
 *
 * so gross is the value of every recorded sale as originally written, and
 * cancelledSales is everything taken back out again — a full cancellation, or
 * the write-down half of an adjustment. A cancelled sale therefore stays fully
 * visible in the gross column and in history while contributing nothing to net.
 */
import { averageCents, commissionFor } from '../money'
import { monthKey, monthRange, yearRange } from '../date'
import type { DateRange } from '../date'
import type { Cents, IsoDate, PeriodTotals, Sale } from '../types'

export type SalePredicate = (sale: Sale) => boolean

/** Either an inclusive date range or an arbitrary predicate. */
export type SaleSelector = DateRange | SalePredicate

export const EMPTY_TOTALS: PeriodTotals = {
  grossSales: 0,
  cancelledSales: 0,
  netSales: 0,
  saleCount: 0,
  averageSale: 0,
  estimatedCommission: 0,
}

// ---------------------------------------------------------------------------
// Per-sale primitives
// ---------------------------------------------------------------------------

export function isCancelled(sale: Sale): boolean {
  return sale.status === 'cancelled'
}

/** Active in the accounting sense: still contributing to net. */
export function isActive(sale: Sale): boolean {
  return sale.status !== 'cancelled'
}

/** What this sale contributes to net: 0 when cancelled, else the adjusted amount. */
export function effectiveAmount(sale: Sale): Cents {
  if (isCancelled(sale)) return 0
  return sale.adjustedAmount ?? sale.amount
}

/** Value removed from gross: the whole sale when cancelled, the write-down when adjusted. */
export function removedAmount(sale: Sale): Cents {
  return sale.amount - effectiveAmount(sale)
}

/**
 * Commission this sale contributes.
 *
 * Normally the frozen `commissionAmount` written at sale time — it is never
 * recomputed from current settings (spec §69). The one exception is a sale
 * revised via `adjustedAmount`: the frozen figure covers money that no longer
 * exists, so it is re-derived from the sale's own FROZEN rate on the amount that
 * actually stands. Still historical, still never touches today's rate.
 */
export function effectiveCommission(sale: Sale): Cents {
  if (isCancelled(sale)) return 0
  const amount = effectiveAmount(sale)
  if (sale.adjustedAmount !== null && sale.adjustedAmount !== sale.amount) {
    return commissionFor(amount, sale.commissionRate)
  }
  return sale.commissionAmount
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function toPredicate(selector?: SaleSelector): SalePredicate {
  if (!selector) return () => true
  if (typeof selector === 'function') return selector
  const { from, to } = selector
  // A sale belongs to the period of its own date, not of its cancellation date:
  // cancelling a January sale in March corrects January.
  return (sale) => sale.date >= from && sale.date <= to
}

export function selectSales(sales: readonly Sale[], selector?: SaleSelector): Sale[] {
  const predicate = toPredicate(selector)
  return sales.filter(predicate)
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export function totalsFor(sales: readonly Sale[], selector?: SaleSelector): PeriodTotals {
  const predicate = toPredicate(selector)
  let grossSales = 0
  let cancelledSales = 0
  let saleCount = 0
  let estimatedCommission = 0

  for (const sale of sales) {
    if (!predicate(sale)) continue
    grossSales += sale.amount
    cancelledSales += removedAmount(sale)
    if (isActive(sale)) {
      saleCount += 1
      estimatedCommission += effectiveCommission(sale)
    }
  }

  const netSales = grossSales - cancelledSales
  return {
    grossSales,
    cancelledSales,
    netSales,
    saleCount,
    averageSale: averageCents(netSales, saleCount),
    estimatedCommission,
  }
}

export function totalsForRange(sales: readonly Sale[], from: IsoDate, to: IsoDate): PeriodTotals {
  return totalsFor(sales, { from, to })
}

export function totalsForDay(sales: readonly Sale[], date: IsoDate): PeriodTotals {
  return totalsFor(sales, { from: date, to: date })
}

/** `month` may be any date in the month, or a 'YYYY-MM' key. */
export function totalsForMonth(sales: readonly Sale[], month: IsoDate | string): PeriodTotals {
  const anchor = month.length === 7 ? `${month}-01` : month
  return totalsFor(sales, monthRange(anchor))
}

/** `year` may be any date in the year, or the numeric year. */
export function totalsForYear(sales: readonly Sale[], year: IsoDate | number): PeriodTotals {
  const anchor = typeof year === 'number' ? `${String(year).padStart(4, '0')}-01-01` : year
  return totalsFor(sales, yearRange(anchor))
}

/** Net sales per calendar day. Only days with sales appear — trends.ts zero-fills. */
export function netByDay(sales: readonly Sale[], selector?: SaleSelector): Map<IsoDate, Cents> {
  const predicate = toPredicate(selector)
  const out = new Map<IsoDate, Cents>()
  for (const sale of sales) {
    if (!predicate(sale)) continue
    out.set(sale.date, (out.get(sale.date) ?? 0) + effectiveAmount(sale))
  }
  return out
}

/** Net sales per 'YYYY-MM'. */
export function netByMonth(sales: readonly Sale[], selector?: SaleSelector): Map<string, Cents> {
  const predicate = toPredicate(selector)
  const out = new Map<string, Cents>()
  for (const sale of sales) {
    if (!predicate(sale)) continue
    const key = monthKey(sale.date)
    out.set(key, (out.get(key) ?? 0) + effectiveAmount(sale))
  }
  return out
}

/** Count of active sales per calendar day. */
export function countByDay(sales: readonly Sale[], selector?: SaleSelector): Map<IsoDate, number> {
  const predicate = toPredicate(selector)
  const out = new Map<IsoDate, number>()
  for (const sale of sales) {
    if (!predicate(sale) || !isActive(sale)) continue
    out.set(sale.date, (out.get(sale.date) ?? 0) + 1)
  }
  return out
}

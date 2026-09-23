/**
 * Ledger state and selection helpers (§19, §71).
 *
 * Nothing in this file computes a metric. Filtering is *selection* — it decides
 * which rows go into `src/core/calc`, never what the resulting number is.
 */
import { useCallback, useEffect } from 'react'
import { useRouter } from '@/app/router'
import { isValidIso, todayIso } from '@/core/date'
import { parseAmountToCents } from '@/core/money'
import type { Category, Cents, IsoDate, PaceStatus, Sale, SaleStatus } from '@/core/types'

/* ------------------------------------------------------------------- tabs */

export type LedgerTab = 'day' | 'month' | 'year' | 'all'

const TABS: readonly LedgerTab[] = ['day', 'month', 'year', 'all']

function isTab(value: unknown): value is LedgerTab {
  return typeof value === 'string' && (TABS as readonly string[]).includes(value)
}

/**
 * Session memory for the ledger.
 *
 * `#/sales?tab=month&date=…` is still the source of truth when it is present,
 * so a refresh or a shared link lands where it says. But the bottom nav links
 * to a bare `#/sales`, so leaving for Home and coming back would otherwise
 * reset the tab. This module-level record survives that round trip without
 * touching storage — it is intentionally session-scoped, not persisted.
 */
const session: { tab: LedgerTab; date: IsoDate | null } = { tab: 'day', date: null }

export interface LedgerRoute {
  tab: LedgerTab
  /** The anchor date. Day view reads the day, Month the month, Year the year. */
  date: IsoDate
  setTab: (tab: LedgerTab) => void
  setDate: (date: IsoDate) => void
  /** Jump to a month and switch to the Month tab — used by the annual chart. */
  goToMonth: (date: IsoDate) => void
}

export function useLedgerRoute(): LedgerRoute {
  const { query, setQuery } = useRouter()

  const tab: LedgerTab = isTab(query.tab) ? query.tab : session.tab
  const date: IsoDate = isValidIso(query.date) ? query.date : (session.date ?? todayIso())

  useEffect(() => {
    session.tab = tab
    session.date = date
  }, [tab, date])

  const setTab = useCallback(
    (next: LedgerTab) => {
      session.tab = next
      setQuery({ tab: next })
    },
    [setQuery],
  )

  const setDate = useCallback(
    (next: IsoDate) => {
      session.date = next
      setQuery({ date: next })
    },
    [setQuery],
  )

  const goToMonth = useCallback(
    (next: IsoDate) => {
      session.tab = 'month'
      session.date = next
      setQuery({ tab: 'month', date: next })
    },
    [setQuery],
  )

  return { tab, date, setTab, setDate, goToMonth }
}

/* ---------------------------------------------------------------- filters */

/** Sentinel for "sales with no category" in the category filter. */
export const UNCATEGORISED = '\u0000uncategorised'

export interface SaleFilters {
  /** Free text. Applies mainly to notes (§71). */
  query: string
  from: IsoDate | ''
  to: IsoDate | ''
  /** Category ids, plus UNCATEGORISED. Empty means "all". */
  categoryIds: string[]
  /** Empty means "all". */
  statuses: SaleStatus[]
  /** Plain dollar text, e.g. "250". Empty means unbounded. */
  minAmount: string
  maxAmount: string
}

export const EMPTY_FILTERS: SaleFilters = {
  query: '',
  from: '',
  to: '',
  categoryIds: [],
  statuses: [],
  minAmount: '',
  maxAmount: '',
}

/**
 * The bounds an amount facet actually imposes.
 *
 * `buildSalePredicate` discards anything `parseAmountToCents` rejects, so this
 * is the single place that decides what "an amount filter" means. Typing `abc`
 * narrows nothing, and must therefore never be counted, summarised or blamed
 * for an empty period.
 */
export function amountBounds(filters: SaleFilters): { min: Cents | null; max: Cents | null } {
  return {
    min: parseAmountToCents(filters.minAmount),
    max: parseAmountToCents(filters.maxAmount),
  }
}

/** Same idea for the date facet: only a real `YYYY-MM-DD` bounds anything. */
export function dateBounds(filters: SaleFilters): { from: IsoDate | null; to: IsoDate | null } {
  return {
    from: isValidIso(filters.from) ? filters.from : null,
    to: isValidIso(filters.to) ? filters.to : null,
  }
}

/**
 * Complaint about an amount box, or null when it is fine.
 *
 * The inputs are `type="text"` (a number spinner is wrong for money on a
 * phone), so unparseable text is reachable and has to be said out loud rather
 * than silently ignored.
 */
export function amountFieldError(value: string): string | null {
  if (value.trim() === '') return null
  return parseAmountToCents(value) === null ? 'Enter an amount like 250 or 1,250.50' : null
}

/** How many filter facets are narrowing the ledger right now. */
export function activeFilterCount(filters: SaleFilters): number {
  const amounts = amountBounds(filters)
  const dates = dateBounds(filters)
  let count = 0
  if (filters.query.trim() !== '') count += 1
  if (dates.from !== null || dates.to !== null) count += 1
  if (filters.categoryIds.length > 0) count += 1
  if (filters.statuses.length > 0) count += 1
  if (amounts.min !== null || amounts.max !== null) count += 1
  return count
}

export function hasActiveFilters(filters: SaleFilters): boolean {
  return activeFilterCount(filters) > 0
}

/**
 * Builds the row predicate. `totalsFor` and friends accept a predicate, so the
 * same function that draws the list also selects what the totals are made of.
 */
export function buildSalePredicate(
  filters: SaleFilters,
  categoriesById: ReadonlyMap<string, Category>,
): (sale: Sale) => boolean {
  const needle = filters.query.trim().toLowerCase()
  const categories = filters.categoryIds.length > 0 ? new Set(filters.categoryIds) : null
  const statuses = filters.statuses.length > 0 ? new Set(filters.statuses) : null
  const { min, max } = amountBounds(filters)
  const { from, to } = dateBounds(filters)

  return (sale: Sale): boolean => {
    if (from !== null && sale.date < from) return false
    if (to !== null && sale.date > to) return false
    if (statuses !== null && !statuses.has(sale.status)) return false
    if (categories !== null) {
      const key = sale.categoryId ?? UNCATEGORISED
      if (!categories.has(key)) return false
    }
    // Amount range reads the ORIGINAL recorded amount, which is what the agent
    // typed and what the row shows for a cancelled sale.
    if (min !== null && sale.amount < min) return false
    if (max !== null && sale.amount > max) return false
    if (needle !== '') {
      const note = sale.note?.toLowerCase() ?? ''
      if (note.includes(needle)) return true
      const name = sale.categoryId ? categoriesById.get(sale.categoryId)?.name : undefined
      return name !== undefined && name.toLowerCase().includes(needle)
    }
    return true
  }
}

/**
 * Human summary of the current filters, for the chip under the search box.
 *
 * It describes what is actually narrowing the list — never a facet the
 * predicate threw away — so the chip and the rows below it can never disagree.
 */
export function describeFilters(
  filters: SaleFilters,
  categoriesById: ReadonlyMap<string, Category>,
): string[] {
  const { min, max } = amountBounds(filters)
  const { from, to } = dateBounds(filters)
  const parts: string[] = []
  // The predicate reads notes AND category names, so the chip says both (§71).
  if (filters.query.trim() !== '')
    parts.push(`Note or category contains "${filters.query.trim()}"`)
  if (from !== null && to !== null) parts.push(`${from} to ${to}`)
  else if (from !== null) parts.push(`From ${from}`)
  else if (to !== null) parts.push(`Up to ${to}`)
  if (filters.categoryIds.length > 0) {
    const names = filters.categoryIds.map((id) =>
      id === UNCATEGORISED ? 'Uncategorised' : (categoriesById.get(id)?.name ?? 'Removed category'),
    )
    parts.push(names.join(', '))
  }
  if (filters.statuses.length > 0) {
    parts.push(filters.statuses.map((s) => STATUS_LABEL[s]).join(', '))
  }
  if (min !== null && max !== null) {
    parts.push(`$${filters.minAmount.trim()}–$${filters.maxAmount.trim()}`)
  } else if (min !== null) {
    parts.push(`Over $${filters.minAmount.trim()}`)
  } else if (max !== null) {
    parts.push(`Under $${filters.maxAmount.trim()}`)
  }
  return parts
}

/* ------------------------------------------------------- filtered labelling */

/**
 * One wording for "this figure counts only the rows your filters kept", and one
 * for the figures that deliberately ignore the filters.
 *
 * Goal progress, pace, the calendar's goal marks and personal records are
 * always measured against the whole period: a filter chooses what you are
 * *browsing*, never the target you are measured against. Anything that is
 * filtered says so, the way the All view already does.
 */
export const FILTERED_NOTE = 'Matching your filters'
export const WHOLE_PERIOD_NOTE =
  'Measured against every sale in this period, not just the filtered rows.'

export const STATUS_LABEL: Record<SaleStatus, string> = {
  active: 'Active',
  adjusted: 'Adjusted',
  cancelled: 'Cancelled',
}

export const ALL_STATUSES: readonly SaleStatus[] = ['active', 'adjusted', 'cancelled']

/** Name for a sale's category, including the two synthetic cases. */
export function categoryNameFor(
  sale: Sale,
  categoriesById: ReadonlyMap<string, Category>,
): string {
  if (sale.categoryId === null) return 'Sale'
  return categoriesById.get(sale.categoryId)?.name ?? 'Removed category'
}

/* -------------------------------------------------------------- pace tone */

/**
 * PaceStatus -> ProgressBar tone, per the design-system mapping. `behind` is
 * deliberately `warning`, never `negative`: §52 asks for restraint, and
 * negative is reserved for cancellations and destructive actions.
 */
export function paceTone(
  status: PaceStatus,
): 'accent' | 'positive' | 'warning' | 'neutral' {
  switch (status) {
    case 'ahead':
    case 'goal-reached':
      return 'positive'
    case 'behind':
      return 'warning'
    case 'on-track':
      return 'accent'
    default:
      return 'neutral'
  }
}

/** Short worded status, so pace is never signalled by colour alone (§63). */
export const PACE_LABEL: Record<PaceStatus, string> = {
  ahead: 'Ahead of pace',
  'on-track': 'On pace',
  behind: 'Behind pace',
  'goal-reached': 'Goal reached',
  'no-goal': 'No goal set',
}

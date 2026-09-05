/**
 * Sales — the agent's personal ledger (§19-25).
 *
 * Shell: header, search + filters, and the Day / Month / Year / All tabs. The
 * tab and the anchor date live in the URL (`#/sales?tab=month&date=…`) and are
 * remembered for the session, so leaving for Home and coming back lands where
 * you were.
 *
 * Two rules govern everything below this line:
 *   1. No metric is computed here. Every figure comes out of `src/core/calc`
 *      and is rendered through `src/core/format`.
 *   2. Net sales is the front-line number everywhere (§18). Gross and
 *      cancellations are available, but never the headline.
 */
import { useCallback, useMemo, useState } from 'react'
import { PageHeader, SegmentedControl } from '@/components'
import { isCancelled, selectSales, totalsFor } from '@/core/calc'
import { useAddSale, useCategories, useGoals, useSales, useSettings } from '@/app/store'
import type { IsoDate } from '@/core/types'
import { SaleEditorSheet } from '@/screens/home/AddSaleSheet'
import { SaleDetailsSheet } from '@/screens/home/SaleDetailsSheet'
import { AllView } from './AllView'
import { DayView } from './DayView'
import { FilterBar } from './FilterBar'
import { MonthView } from './MonthView'
import { YearView } from './YearView'
import {
  EMPTY_FILTERS,
  buildSalePredicate,
  hasActiveFilters,
  useLedgerRoute,
  type LedgerTab,
  type SaleFilters,
} from './ledger'
import './sales.css'

const TAB_OPTIONS: ReadonlyArray<{ value: LedgerTab; label: string; ariaLabel: string }> = [
  { value: 'day', label: 'Day', ariaLabel: 'Day view' },
  { value: 'month', label: 'Month', ariaLabel: 'Month view' },
  { value: 'year', label: 'Year', ariaLabel: 'Year view' },
  { value: 'all', label: 'All', ariaLabel: 'All sales' },
]

const PANEL_ID = 'ledger-panel'

export default function SalesScreen() {
  const { sortedSales, salesById } = useSales()
  const { activeCategories, categoriesById } = useCategories()
  const { goals } = useGoals()
  const settings = useSettings()
  const addSale = useAddSale()

  const { tab, date, setTab, setDate, goToMonth } = useLedgerRoute()

  const [filters, setFilters] = useState<SaleFilters>(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const filtersActive = hasActiveFilters(filters)

  /**
   * The filtered set feeds the lists and the figures that describe them, so a
   * summary always matches exactly the rows on screen. With no filters the
   * store's own sorted array is passed straight through — no copy of five
   * thousand rows.
   *
   * `sortedSales` goes down as well, unfiltered: goal progress, pace, the
   * calendar's goal marks and personal records are measured against the whole
   * period. A filter chooses what you are browsing, never the target you are
   * measured against.
   */
  const visibleSales = useMemo(() => {
    if (!filtersActive) return sortedSales
    const predicate = buildSalePredicate(filters, categoriesById)
    return sortedSales.filter(predicate)
  }, [sortedSales, filters, filtersActive, categoriesById])

  /**
   * What the filter summary is allowed to claim.
   *
   * `saleCount` comes from the same `totalsFor` the All view renders, so the
   * summary and the card beneath it can never disagree — a Cancelled-only
   * filter reads "0 sales · 17 cancelled", not "17 sales" above a $0 card.
   * Only computed while filters are on, since that is the only time the
   * summary line exists.
   */
  const summaryCounts = useMemo(() => {
    if (!filtersActive) return { matchCount: 0, cancelledCount: 0 }
    return {
      matchCount: totalsFor(visibleSales).saleCount,
      cancelledCount: selectSales(visibleSales, isCancelled).length,
    }
  }, [visibleSales, filtersActive])

  const selectedSale = selectedId === null ? null : (salesById.get(selectedId) ?? null)
  const editingSale = editingId === null ? null : (salesById.get(editingId) ?? null)

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), [])
  const openAddSale = useCallback(
    (on: IsoDate) => {
      addSale.open({ date: on })
    },
    [addSale],
  )
  const selectSale = useCallback((id: string) => setSelectedId(id), [])

  return (
    <div className="pad-for-nav">
      <PageHeader title="Sales" subtitle="Your personal ledger" showStoredLocally />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        categories={activeCategories}
        categoriesById={categoriesById}
        matchCount={summaryCounts.matchCount}
        cancelledCount={summaryCounts.cancelledCount}
      />

      <div className="ledger__tabs">
        <SegmentedControl<LedgerTab>
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
          role="tabs"
          controlsId={PANEL_ID}
          label="Ledger period"
        />
      </div>

      <div
        className="ledger__panel"
        id={PANEL_ID}
        role="tabpanel"
        aria-label="Ledger"
        tabIndex={-1}
      >
        {tab === 'day' && (
          <DayView
            date={date}
            sales={visibleSales}
            totalSaleCount={sortedSales.length}
            filtersActive={filtersActive}
            settings={settings}
            categoriesById={categoriesById}
            onDate={setDate}
            onSelectSale={selectSale}
            onAddSale={openAddSale}
            onClearFilters={clearFilters}
          />
        )}

        {tab === 'month' && (
          <MonthView
            date={date}
            sales={visibleSales}
            allSales={sortedSales}
            goals={goals}
            totalSaleCount={sortedSales.length}
            filtersActive={filtersActive}
            settings={settings}
            categoriesById={categoriesById}
            onDate={setDate}
            onSelectSale={selectSale}
            onAddSale={openAddSale}
            onClearFilters={clearFilters}
          />
        )}

        {tab === 'year' && (
          <YearView
            date={date}
            sales={visibleSales}
            allSales={sortedSales}
            goals={goals}
            totalSaleCount={sortedSales.length}
            filtersActive={filtersActive}
            settings={settings}
            onDate={setDate}
            onOpenMonth={goToMonth}
            onClearFilters={clearFilters}
          />
        )}

        {tab === 'all' && (
          <AllView
            sales={visibleSales}
            totalSaleCount={sortedSales.length}
            filtersActive={filtersActive}
            settings={settings}
            categoriesById={categoriesById}
            onSelectSale={selectSale}
            onClearFilters={clearFilters}
          />
        )}
      </div>

      {/* Sale Details and the editor are the Home team's components (§15-17),
          mounted here rather than reimplemented, so a sale opened from the
          ledger behaves exactly as one opened from Home. */}
      <SaleDetailsSheet
        open={selectedSale !== null && editingId === null}
        sale={selectedSale}
        onClose={() => setSelectedId(null)}
        onEdit={(sale) => setEditingId(sale.id)}
      />

      <SaleEditorSheet
        open={editingSale !== null}
        sale={editingSale}
        onClose={() => {
          setEditingId(null)
          setSelectedId(null)
        }}
      />
    </div>
  )
}

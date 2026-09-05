/**
 * Year view — §24, §25.
 *
 * Hero: net sales of the annual goal, with the percentage. Then the monthly bar
 * chart, then the annual metric set. Records are scoped to the year on screen,
 * which is what "best month" means when you are looking at 2026.
 *
 * The hero, the pace footnote and the two records are read from `allSales` —
 * the year as it really happened. A filter decides which rows you are reading,
 * never what your goal was or which day was actually your best. Everything the
 * filters do shape says "Matching your filters" beside it.
 */
import { useMemo } from 'react'
import { Card, EmptyState, ProgressBar, StatGrid, StatTile } from '@/components'
import {
  annualPace,
  monthlySeries,
  personalRecords,
  selectSales,
  totalsForYear,
} from '@/core/calc'
import { isoForYear, monthKeyToIso, todayIso, yearOf, yearRange } from '@/core/date'
import {
  EM_DASH,
  formatCurrency,
  formatDate,
  formatMonthKey,
  formatNumber,
  formatPercent,
} from '@/core/format'
import { percentOf } from '@/core/money'
import type { Goal, IsoDate, Sale, Settings } from '@/core/types'
import { AnnualChart } from './AnnualChart'
import { PeriodStepper } from './PeriodStepper'
import { LedgerEmpty } from './LedgerEmpty'
import { FILTERED_NOTE, PACE_LABEL, WHOLE_PERIOD_NOTE, paceTone } from './ledger'

export interface YearViewProps {
  date: IsoDate
  /** Filtered, newest first. */
  sales: Sale[]
  /** Every sale in the ledger. Goal progress and records measure against this. */
  allSales: Sale[]
  goals: readonly Goal[]
  totalSaleCount: number
  filtersActive: boolean
  settings: Settings
  onDate: (date: IsoDate) => void
  onOpenMonth: (date: IsoDate) => void
  onClearFilters: () => void
}

export function YearView({
  date,
  sales,
  allSales,
  goals,
  totalSaleCount,
  filtersActive,
  settings,
  onDate,
  onOpenMonth,
  onClearFilters,
}: YearViewProps) {
  const today = todayIso()
  const thisYear = yearOf(today)
  const year = yearOf(date)
  const anchor = isoForYear(year)

  const totals = useMemo(() => totalsForYear(sales, year), [sales, year])
  // The hero and the progress bar describe the year itself, so both read the
  // unfiltered ledger. Filtering to sales over $1,000 must not report 2% of a
  // goal the agent is actually 96% of the way through.
  const actualTotals = useMemo(() => totalsForYear(allSales, year), [allSales, year])
  const pace = useMemo(
    () => annualPace(allSales, goals, settings, anchor, today),
    [allSales, goals, settings, anchor, today],
  )
  const series = useMemo(
    () => monthlySeries(sales, year, { locale: settings.locale }),
    [sales, year, settings.locale],
  )
  const yearSales = useMemo(() => selectSales(sales, yearRange(anchor)), [sales, anchor])
  const recordSales = useMemo(
    () => (filtersActive ? selectSales(allSales, yearRange(anchor)) : yearSales),
    [filtersActive, allSales, anchor, yearSales],
  )
  const records = useMemo(
    () => personalRecords(recordSales, goals, settings, today),
    [recordSales, goals, settings, today],
  )

  const goalLabel = pace.goal === null ? EM_DASH : formatCurrency(pace.goal, settings)
  const activeKey = year === thisYear ? today.slice(0, 7) : undefined

  return (
    <div className="shell-stack">
      <PeriodStepper
        label={String(year)}
        previousLabel="Previous year"
        nextLabel="Next year"
        onPrevious={() => onDate(isoForYear(year - 1))}
        onNext={() => onDate(isoForYear(year + 1))}
        nextDisabled={year >= thisYear}
        jumpLabel={year === thisYear ? undefined : 'Back to this year'}
        onJump={year === thisYear ? undefined : () => onDate(today)}
      />

      <Card tone="accent">
        <StatTile
          label="Net Sales"
          value={formatCurrency(actualTotals.netSales, settings)}
          size="xl"
          sub={
            pace.goal === null
              ? 'No annual goal set'
              : `of ${goalLabel} · ${formatPercent(pace.progress, settings)}`
          }
          ariaLabel={
            pace.goal === null
              ? `Net sales ${formatCurrency(actualTotals.netSales, settings)} in ${year}. No annual goal set.`
              : `Net sales ${formatCurrency(actualTotals.netSales, settings)} of ${goalLabel} in ${year}, ${formatPercent(pace.progress, settings)} of goal`
          }
        />
        {pace.goal !== null && (
          <ProgressBar
            label={`Annual goal progress for ${year}`}
            value={pace.progress}
            tone={paceTone(pace.status)}
            size="lg"
            caption={`${formatCurrency(pace.actual, settings)} / ${goalLabel}`}
            markerAt={percentOf(pace.expected, pace.goal)}
            markerLabel="Expected by today"
            footnote={
              pace.requiredPerWorkday === null
                ? PACE_LABEL[pace.status]
                : `${PACE_LABEL[pace.status]} · ${formatCurrency(pace.requiredPerWorkday, settings, { decimals: 'always' })} per workday to finish`
            }
          />
        )}
        {filtersActive && <p className="ledger__footnote">{WHOLE_PERIOD_NOTE}</p>}
      </Card>

      {/* §25 — the annual bar chart. */}
      <Card title="Monthly Performance">
        <AnnualChart
          series={series}
          settings={settings}
          year={year}
          activeKey={activeKey}
          onSelectMonth={(key) => onOpenMonth(monthKeyToIso(key))}
        />
        {filtersActive && <p className="ledger__footnote">{FILTERED_NOTE}</p>}
      </Card>

      <Card title={`${year} Totals`}>
        <StatGrid columns={2}>
          <StatTile
            label="Net Sales"
            value={formatCurrency(totals.netSales, settings)}
            size="sm"
            sub={filtersActive ? FILTERED_NOTE : undefined}
          />
          <StatTile
            label="Gross Sales"
            value={formatCurrency(totals.grossSales, settings)}
            size="sm"
            sub={
              totals.cancelledSales > 0
                ? `less ${formatCurrency(totals.cancelledSales, settings)} cancelled`
                : undefined
            }
          />
          <StatTile
            label="Sales"
            value={formatNumber(totals.saleCount, settings)}
            size="sm"
            sub={filtersActive ? FILTERED_NOTE : undefined}
          />
          <StatTile
            label="Average Sale"
            value={formatCurrency(totals.averageSale, settings)}
            size="sm"
          />
          {settings.commissionEnabled && (
            <StatTile
              label="Commission"
              value={formatCurrency(totals.estimatedCommission, settings, { decimals: 'always' })}
              size="sm"
              sub="Estimated"
            />
          )}
          <StatTile
            label="Best Month"
            value={
              records.bestMonth
                ? formatCurrency(records.bestMonth.amount, settings)
                : EM_DASH
            }
            size="sm"
            sub={
              records.bestMonth
                ? formatMonthKey(records.bestMonth.month, settings, 'monthYearShort')
                : 'Not set yet'
            }
            ariaLabel={
              records.bestMonth
                ? `Best month ${formatMonthKey(records.bestMonth.month, settings)}, ${formatCurrency(records.bestMonth.amount, settings)}`
                : 'Best month, not set yet'
            }
          />
          <StatTile
            label="Best Day"
            value={records.bestDay ? formatCurrency(records.bestDay.amount, settings) : EM_DASH}
            size="sm"
            sub={records.bestDay ? formatDate(records.bestDay.date, settings, 'medium') : 'Not set yet'}
            ariaLabel={
              records.bestDay
                ? `Best day ${formatDate(records.bestDay.date, settings, 'long')}, ${formatCurrency(records.bestDay.amount, settings)}`
                : 'Best day, not set yet'
            }
          />
        </StatGrid>
        {filtersActive && (
          <p className="ledger__footnote">
            {`Best month and best day read every sale in ${year}; the rest of this card matches your filters.`}
          </p>
        )}
      </Card>

      {yearSales.length === 0 && (
        <Card>
          <LedgerEmpty
            totalSaleCount={totalSaleCount}
            filtersActive={filtersActive}
            onClearFilters={onClearFilters}
            fallback={
              <EmptyState
                title={`Nothing recorded in ${year}.`}
                body="Step to another year, or record a sale to start filling the chart."
              />
            }
          />
        </Card>
      )}
    </div>
  )
}

export default YearView

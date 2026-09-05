/**
 * Month view — §21, §22, §23.
 *
 * Totals, then the calendar, then progress against the monthly goal. The
 * calendar's selected day drives the anchor date, so switching to the Day tab
 * lands exactly where the agent was looking.
 *
 * Two sets of sales arrive here on purpose. `sales` is what the filters kept:
 * it draws the lists and the totals card, and every figure it produces is
 * labelled "Matching your filters". `allSales` is the month as it really
 * happened, and it is the only thing goal progress, pace and the calendar's
 * goal marks are ever measured against — filtering to sales over $1,000 must
 * not turn a month at 96% of goal into one "behind pace" at 24%.
 */
import { useMemo } from 'react'
import { Button, Card, EmptyState, ProgressBar, StatGrid, StatTile } from '@/components'
import { monthlyPace, selectSales, totalsForMonth, shiftMonth } from '@/core/calc'
import {
  compareIso,
  monthRange,
  startOfMonth,
  todayIso,
} from '@/core/date'
import { EM_DASH, formatCurrency, formatDate, formatNumber, formatPercent } from '@/core/format'
import { percentOf } from '@/core/money'
import type { Category, Goal, IsoDate, Sale, Settings } from '@/core/types'
import { MonthCalendar } from './MonthCalendar'
import { PeriodStepper } from './PeriodStepper'
import { SaleList } from './SaleList'
import { LedgerEmpty } from './LedgerEmpty'
import { FILTERED_NOTE, PACE_LABEL, WHOLE_PERIOD_NOTE, paceTone } from './ledger'

export interface MonthViewProps {
  date: IsoDate
  /** Filtered, newest first — the rows and the figures that describe them. */
  sales: Sale[]
  /** Every sale in the ledger. Goal progress and pace measure against this. */
  allSales: Sale[]
  goals: readonly Goal[]
  totalSaleCount: number
  filtersActive: boolean
  settings: Settings
  categoriesById: ReadonlyMap<string, Category>
  onDate: (date: IsoDate) => void
  onSelectSale: (id: string) => void
  onAddSale: (date: IsoDate) => void
  onClearFilters: () => void
}

export function MonthView({
  date,
  sales,
  allSales,
  goals,
  totalSaleCount,
  filtersActive,
  settings,
  categoriesById,
  onDate,
  onSelectSale,
  onAddSale,
  onClearFilters,
}: MonthViewProps) {
  const today = todayIso()
  const thisMonth = startOfMonth(today)
  const month = startOfMonth(date)

  const totals = useMemo(() => totalsForMonth(sales, month), [sales, month])
  // Unfiltered: the goal is the month's target, not the target for the slice
  // of the month you happen to be browsing.
  const pace = useMemo(
    () => monthlyPace(allSales, goals, settings, month, today),
    [allSales, goals, settings, month, today],
  )
  const monthSales = useMemo(() => selectSales(sales, monthRange(month)), [sales, month])
  const daySales = useMemo(() => selectSales(sales, { from: date, to: date }), [sales, date])

  const dayGroups = useMemo(
    () => [
      {
        key: date,
        label: formatDate(date, settings, 'weekday'),
        total: '',
        sales: daySales,
      },
    ],
    [date, daySales, settings],
  )

  const goalLabel = pace.goal === null ? EM_DASH : formatCurrency(pace.goal, settings)

  return (
    <div className="shell-stack">
      <PeriodStepper
        label={formatDate(month, settings, 'monthYear')}
        previousLabel="Previous month"
        nextLabel="Next month"
        onPrevious={() => onDate(shiftMonth(month, -1))}
        onNext={() => onDate(shiftMonth(month, 1))}
        nextDisabled={compareIso(month, thisMonth) >= 0}
        jumpLabel={month === thisMonth ? undefined : 'Back to this month'}
        onJump={month === thisMonth ? undefined : () => onDate(today)}
      />

      <Card>
        <StatTile
          label="Net Sales"
          value={formatCurrency(totals.netSales, settings)}
          size="xl"
          sub={filtersActive ? FILTERED_NOTE : undefined}
          ariaLabel={`Net sales ${formatCurrency(totals.netSales, settings)} in ${formatDate(month, settings, 'monthYear')}${
            filtersActive ? ', matching your filters' : ''
          }`}
        />
        <StatGrid columns={settings.commissionEnabled ? 3 : 2}>
          <StatTile label="Sales" value={formatNumber(totals.saleCount, settings)} size="sm" />
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
        </StatGrid>
        {totals.cancelledSales > 0 && (
          <p className="ledger__footnote">
            {`Gross ${formatCurrency(totals.grossSales, settings)} · cancellations ${formatCurrency(totals.cancelledSales, settings)}`}
          </p>
        )}
      </Card>

      {/* §22 — the calendar, and the day it selects. */}
      <Card title="Calendar">
        <MonthCalendar
          month={month}
          sales={monthSales}
          allSales={allSales}
          goals={goals}
          settings={settings}
          selected={date}
          filtersActive={filtersActive}
          onSelect={onDate}
        />
      </Card>

      <Card
        title={formatDate(date, settings, 'weekday')}
        headerAction={
          <Button variant="ghost" size="md" onClick={() => onAddSale(date)}>
            Add Sale
          </Button>
        }
        padding={daySales.length > 0 ? 'sm' : 'md'}
      >
        {daySales.length > 0 ? (
          <SaleList
            groups={dayGroups}
            settings={settings}
            categoriesById={categoriesById}
            onSelect={onSelectSale}
            hideHeaders
          />
        ) : (
          <EmptyState
            compact
            icon={null}
            title="Nothing recorded on this day."
            body="Pick another day above, or add a sale for this date."
          />
        )}
      </Card>

      {/* §23 — month progress. Every figure comes from monthlyPace. */}
      <Card title="Month Progress">
        {pace.goal === null ? (
          <EmptyState
            compact
            icon={null}
            title="No monthly goal set."
            body="Add one in Settings and this month gets a target to work against."
          />
        ) : (
          <>
            <ProgressBar
              label={`Monthly goal progress for ${formatDate(month, settings, 'monthYear')}`}
              value={pace.progress}
              tone={paceTone(pace.status)}
              size="lg"
              caption={`${formatCurrency(pace.actual, settings)} / ${goalLabel}`}
              markerAt={percentOf(pace.expected, pace.goal)}
              markerLabel="Expected by today"
              footnote={PACE_LABEL[pace.status]}
            />
            <StatGrid columns={3}>
              <StatTile label="Monthly Goal" value={goalLabel} size="sm" />
              <StatTile label="Sold" value={formatCurrency(pace.actual, settings)} size="sm" />
              <StatTile
                label="Remaining"
                value={formatCurrency(pace.remaining, settings)}
                size="sm"
              />
              <StatTile label="Progress" value={formatPercent(pace.progress, settings)} size="sm" />
              <StatTile
                label="Workdays Left"
                value={formatNumber(pace.workdaysRemaining, settings)}
                size="sm"
                sub={`of ${formatNumber(pace.workdaysTotal, settings)}`}
              />
              <StatTile
                label="Per Workday"
                value={
                  pace.requiredPerWorkday === null
                    ? EM_DASH
                    : formatCurrency(pace.requiredPerWorkday, settings, { decimals: 'always' })
                }
                size="sm"
                sub={pace.requiredPerWorkday === null ? 'Month complete' : 'Required'}
                ariaLabel={
                  pace.requiredPerWorkday === null
                    ? 'Required per workday: the month is complete'
                    : `Required per workday ${formatCurrency(pace.requiredPerWorkday, settings, { decimals: 'always' })}`
                }
              />
            </StatGrid>
            {filtersActive && <p className="ledger__footnote">{WHOLE_PERIOD_NOTE}</p>}
          </>
        )}
      </Card>

      {monthSales.length === 0 && (
        <Card>
          <LedgerEmpty
            totalSaleCount={totalSaleCount}
            filtersActive={filtersActive}
            onClearFilters={onClearFilters}
            fallback={
              <EmptyState
                title="Nothing recorded this month."
                body="Sales appear on the calendar as soon as you record them."
                action={
                  <Button variant="primary" size="md" onClick={() => onAddSale(date)}>
                    Add Sale
                  </Button>
                }
              />
            }
          />
        </Card>
      )}
    </div>
  )
}

export default MonthView

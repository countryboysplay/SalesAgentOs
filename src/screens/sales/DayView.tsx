/**
 * Day view — §20.
 *
 * Date stepper, a four-figure summary, then that day's sales in order.
 * Net sales is the headline; gross and cancellations live in Sale Details (§18).
 */
import { useMemo } from 'react'
import { Button, Card, EmptyState, StatGrid, StatTile } from '@/components'
import { selectSales, totalsForDay } from '@/core/calc'
import { addDays, compareIso, todayIso, yearOf } from '@/core/date'
import { formatCurrency, formatDate, formatNumber } from '@/core/format'
import type { Category, IsoDate, Sale, Settings } from '@/core/types'
import { PeriodStepper } from './PeriodStepper'
import { SaleList } from './SaleList'
import { LedgerEmpty } from './LedgerEmpty'
import { FILTERED_NOTE } from './ledger'

export interface DayViewProps {
  date: IsoDate
  /** Already filtered, newest first. */
  sales: Sale[]
  totalSaleCount: number
  filtersActive: boolean
  settings: Settings
  categoriesById: ReadonlyMap<string, Category>
  onDate: (date: IsoDate) => void
  onSelectSale: (id: string) => void
  onAddSale: (date: IsoDate) => void
  onClearFilters: () => void
}

export function DayView({
  date,
  sales,
  totalSaleCount,
  filtersActive,
  settings,
  categoriesById,
  onDate,
  onSelectSale,
  onAddSale,
  onClearFilters,
}: DayViewProps) {
  const today = todayIso()
  const totals = useMemo(() => totalsForDay(sales, date), [sales, date])
  const daySales = useMemo(() => selectSales(sales, { from: date, to: date }), [sales, date])

  const groups = useMemo(
    () => [{ key: date, label: formatDate(date, settings, 'weekday'), total: '', sales: daySales }],
    [date, daySales, settings],
  )

  return (
    <div className="shell-stack">
      <PeriodStepper
        label={formatDate(date, settings, 'weekday')}
        sub={String(yearOf(date))}
        previousLabel="Previous day"
        nextLabel="Next day"
        onPrevious={() => onDate(addDays(date, -1))}
        onNext={() => onDate(addDays(date, 1))}
        nextDisabled={compareIso(date, today) >= 0}
        jumpLabel={date === today ? undefined : 'Back to today'}
        onJump={date === today ? undefined : () => onDate(today)}
      />

      <Card>
        <StatTile
          label="Net Sales"
          value={formatCurrency(totals.netSales, settings)}
          size="xl"
          sub={filtersActive ? FILTERED_NOTE : undefined}
          ariaLabel={`Net sales ${formatCurrency(totals.netSales, settings)} on ${formatDate(date, settings, 'long')}${
            filtersActive ? ', matching your filters' : ''
          }`}
        />
        <StatGrid columns={settings.commissionEnabled ? 3 : 2}>
          <StatTile
            label="Sales"
            value={formatNumber(totals.saleCount, settings)}
            size="sm"
          />
          <StatTile
            label="Average"
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

      <Card padding={daySales.length > 0 ? 'none' : 'md'}>
        {daySales.length > 0 ? (
          <SaleList
            groups={groups}
            settings={settings}
            categoriesById={categoriesById}
            onSelect={onSelectSale}
            hideHeaders
          />
        ) : (
          <LedgerEmpty
            totalSaleCount={totalSaleCount}
            filtersActive={filtersActive}
            onClearFilters={onClearFilters}
            fallback={
              <EmptyState
                title={date === today ? 'Nothing on the board yet.' : 'Nothing recorded on this day.'}
                body={
                  date === today
                    ? 'Record your first sale when it comes in.'
                    : `Add a sale for ${formatDate(date, settings, 'long')}, or step to another day.`
                }
                action={
                  <Button variant="primary" size="md" onClick={() => onAddSale(date)}>
                    Add Sale
                  </Button>
                }
              />
            }
          />
        )}
      </Card>
    </div>
  )
}

export default DayView

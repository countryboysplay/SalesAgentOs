/**
 * All view — the full history.
 *
 * Grouped by month with a pinned month header. The list is virtualised: the app
 * is specified to hold thousands of records and 5,000 rows in the DOM would
 * cost several hundred milliseconds of layout on a phone. Only the rows in the
 * viewport are mounted; the rest are offsets in a table built once per change
 * to the filtered set.
 *
 * Month subtotals come from `netByMonth`, which walks the list once, rather
 * than calling `totalsForMonth` per group.
 */
import { useMemo } from 'react'
import { Card, EmptyState, StatGrid, StatTile } from '@/components'
import { netByMonth, totalsFor } from '@/core/calc'
import { monthKey } from '@/core/date'
import { formatCurrency, formatMonthKey, formatNumber } from '@/core/format'
import type { Category, Sale, Settings } from '@/core/types'
import { VirtualSaleList, type SaleGroup } from './SaleList'
import { LedgerEmpty } from './LedgerEmpty'
import { FILTERED_NOTE } from './ledger'

export interface AllViewProps {
  /** Already filtered, newest first. */
  sales: Sale[]
  totalSaleCount: number
  filtersActive: boolean
  settings: Settings
  categoriesById: ReadonlyMap<string, Category>
  onSelectSale: (id: string) => void
  onClearFilters: () => void
}

export function AllView({
  sales,
  totalSaleCount,
  filtersActive,
  settings,
  categoriesById,
  onSelectSale,
  onClearFilters,
}: AllViewProps) {
  const totals = useMemo(() => totalsFor(sales), [sales])

  const groups = useMemo<SaleGroup[]>(() => {
    const netPerMonth = netByMonth(sales)
    const out: SaleGroup[] = []
    let current: SaleGroup | null = null

    // `sales` is already newest-first, so a single pass produces the groups in
    // reading order without a sort.
    for (const sale of sales) {
      const key = monthKey(sale.date)
      if (current === null || current.key !== key) {
        current = {
          key,
          label: formatMonthKey(key, settings),
          total: formatCurrency(netPerMonth.get(key) ?? 0, settings),
          sales: [],
        }
        out.push(current)
      }
      current.sales.push(sale)
    }
    return out
  }, [sales, settings])

  return (
    <div className="shell-stack">
      <Card>
        <StatGrid columns={settings.commissionEnabled ? 3 : 2}>
          <StatTile
            label="Net Sales"
            value={formatCurrency(totals.netSales, settings)}
            size="md"
            sub={filtersActive ? FILTERED_NOTE : 'All time'}
          />
          <StatTile
            label="Sales"
            value={formatNumber(totals.saleCount, settings)}
            size="md"
            sub={`${formatNumber(groups.length, settings)} ${groups.length === 1 ? 'month' : 'months'}`}
          />
          {settings.commissionEnabled && (
            <StatTile
              label="Commission"
              value={formatCurrency(totals.estimatedCommission, settings, { decimals: 'always' })}
              size="md"
              sub="Estimated"
            />
          )}
        </StatGrid>
      </Card>

      <Card padding={sales.length > 0 ? 'none' : 'md'}>
        {sales.length > 0 ? (
          <VirtualSaleList
            groups={groups}
            settings={settings}
            categoriesById={categoriesById}
            onSelect={onSelectSale}
            showDates
          />
        ) : (
          <LedgerEmpty
            totalSaleCount={totalSaleCount}
            filtersActive={filtersActive}
            onClearFilters={onClearFilters}
            fallback={
              <EmptyState
                title="Your sales history will appear here."
                body="Every sale you record is kept on this device."
              />
            }
          />
        )}
      </Card>
    </div>
  )
}

export default AllView

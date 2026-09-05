/**
 * Performance metrics (§27).
 *
 * Net sales leads at display size and everything else sits under it in a
 * quieter grid — §50 wants the numbers to dominate, and a screen where six
 * figures shout equally has no headline at all.
 */
import { useMemo } from 'react'
import { Card, StatGrid, StatTile } from '@/components'
import { averagePerWorkday, goalAttainment, totalsFor } from '@/core/calc'
import { EM_DASH, formatCurrency, formatNumber, formatPercent } from '@/core/format'
import type { Goal, Sale, Settings } from '@/core/types'
import type { ResolvedRange } from './range'

export interface PerformanceSectionProps {
  sales: readonly Sale[]
  goals: readonly Goal[]
  settings: Settings
  range: ResolvedRange
}

export function PerformanceSection({ sales, goals, settings, range }: PerformanceSectionProps) {
  const { from, to } = range

  const metrics = useMemo(() => {
    const window = { from, to }
    return {
      totals: totalsFor(sales, window),
      perWorkday: averagePerWorkday(sales, settings, window),
      attainment: goalAttainment(sales, goals, settings, window),
    }
  }, [sales, goals, settings, from, to])

  const { totals, perWorkday, attainment } = metrics

  return (
    <Card title="Performance" headerAction={<span className="insights__scope">{range.label}</span>}>
      <div className="insights__headline">
        <StatTile
          size="xl"
          label="Net sales"
          value={formatCurrency(totals.netSales, settings)}
          sub={range.label}
        />
      </div>

      <StatGrid columns={2} className="insights__metrics">
        <StatTile
          size="sm"
          label="Sales"
          value={formatNumber(totals.saleCount, settings)}
          sub={totals.saleCount === 1 ? 'sale recorded' : 'sales recorded'}
        />
        <StatTile
          size="sm"
          label="Average sale"
          value={
            totals.saleCount > 0 ? formatCurrency(totals.averageSale, settings) : EM_DASH
          }
          sub={totals.saleCount > 0 ? 'per sale' : 'waiting on a sale'}
        />
        {settings.commissionEnabled && (
          <StatTile
            size="sm"
            label="Est. commission"
            value={formatCurrency(totals.estimatedCommission, settings)}
            sub="at the rate saved with each sale"
          />
        )}
        <StatTile
          size="sm"
          label="Per working day"
          value={formatCurrency(perWorkday, settings)}
          sub="across your working days"
        />
        <StatTile
          size="sm"
          label="Goal attainment"
          value={attainment.workdays > 0 ? formatPercent(attainment.rate, settings, 0) : EM_DASH}
          sub={
            attainment.workdays > 0
              ? `${formatNumber(attainment.hits, settings)} of ${formatNumber(
                  attainment.workdays,
                  settings,
                )} working days met`
              : 'set a daily goal to track this'
          }
          ariaLabel={
            attainment.workdays > 0
              ? `Goal attainment ${formatPercent(attainment.rate, settings, 0)}. ${formatNumber(
                  attainment.hits,
                  settings,
                )} of ${formatNumber(attainment.workdays, settings)} working days met the daily goal.`
              : 'Goal attainment not tracked yet. Set a daily goal to track this.'
          }
        />
      </StatGrid>

      {totals.cancelledSales > 0 && (
        <p className="insights__note">
          Net excludes {formatCurrency(totals.cancelledSales, settings)} cancelled or adjusted in
          this range. The full history stays in your ledger.
        </p>
      )}
    </Card>
  )
}

export default PerformanceSection

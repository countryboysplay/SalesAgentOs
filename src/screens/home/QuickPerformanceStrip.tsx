/**
 * Quick Performance Strip — spec §11.
 *
 * Three compact cards directly below Today: Month, Year, Commission. Each one
 * is tappable through to its detail view. The commission card is hidden
 * entirely when commission tracking is off (§33).
 */
import { Card, StatTile } from '@/components'
import { useNavigate, ROUTES } from '@/app/router'
import { formatCurrency, formatPercent } from '@/core/format'
import type { FormatSettings } from '@/core/format'
import type { Cents, PaceResult } from '@/core/types'

export interface QuickPerformanceStripProps {
  month: PaceResult
  year: PaceResult
  /** Year-to-date estimated commission, from PeriodTotals. */
  commission: Cents
  commissionEnabled: boolean
  settings: FormatSettings
}

export function QuickPerformanceStrip({
  month,
  year,
  commission,
  commissionEnabled,
  settings,
}: QuickPerformanceStripProps) {
  const navigate = useNavigate()

  return (
    <div className="shell-metrics quick-strip">
      <PeriodCard
        label="Month"
        pace={month}
        settings={settings}
        onClick={() => navigate(ROUTES.sales, { query: { tab: 'month' } })}
        goToLabel="Open this month"
      />
      <PeriodCard
        label="Year"
        pace={year}
        settings={settings}
        onClick={() => navigate(ROUTES.sales, { query: { tab: 'year' } })}
        goToLabel="Open this year"
      />
      {commissionEnabled && (
        <Card
          padding="md"
          onClick={() => navigate(ROUTES.insights)}
          ariaLabel={`Commission, ${formatCurrency(commission, settings)} estimated so far this year. Open insights.`}
          className="quick-strip__card"
        >
          <StatTile
            label="Commission"
            value={formatCurrency(commission, settings)}
            sub="Est. year to date"
            size="lg"
          />
        </Card>
      )}
    </div>
  )
}

function PeriodCard({
  label,
  pace,
  settings,
  onClick,
  goToLabel,
}: {
  label: string
  pace: PaceResult
  settings: FormatSettings
  onClick: () => void
  goToLabel: string
}) {
  const amount = formatCurrency(pace.actual, settings)
  const hasGoal = pace.goal !== null && pace.goal > 0
  const sub = hasGoal
    ? `${formatPercent(pace.progress, settings)} of ${formatCurrency(pace.goal ?? 0, settings)}`
    : 'No goal set'

  return (
    <Card
      padding="md"
      onClick={onClick}
      ariaLabel={`${label}, ${amount}. ${sub}. ${goToLabel}.`}
      className="quick-strip__card"
    >
      <StatTile label={label} value={amount} sub={sub} size="lg" />
    </Card>
  )
}

export default QuickPerformanceStrip

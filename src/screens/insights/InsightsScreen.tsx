/**
 * Insights (§26-31).
 *
 * Section order is the spec's: Performance, then the trend, then Pace, then
 * Records, then Categories. The time selector at the top drives the three
 * range-shaped sections; Pace is a calendar month and year by definition
 * (§66-68) and Records are all-time personal bests (§29), and both say so on
 * their own header rather than pretending to follow the selector.
 *
 * The selected range lives in the URL (`#/insights?range=90d`), so a reload,
 * a back gesture or a shared link all land on the same view.
 */
import { useMemo } from 'react'
import { Button, EmptyState, PageHeader, SegmentedControl } from '@/components'
import { useRouter } from '@/app/router'
import { useAddSale, useCategories, useGoals, useSales, useSettings } from '@/app/store'
import CategorySection from './CategorySection'
import PaceSection from './PaceSection'
import PerformanceSection from './PerformanceSection'
import RecordsSection from './RecordsSection'
import TrendSection from './TrendSection'
import { DEFAULT_RANGE, RANGE_OPTIONS, isInsightsRange, resolveRange } from './range'
import type { InsightsRange } from './range'
import { useToday } from './today'
import './insights.css'

export default function InsightsScreen() {
  const { query, setQuery } = useRouter()
  const { sales } = useSales()
  const { categories } = useCategories()
  const { goals } = useGoals()
  const settings = useSettings()
  const addSale = useAddSale()

  // Re-read at midnight and whenever the app comes back to the foreground, so
  // a PWA left open overnight does not keep charting a range that ends
  // yesterday.
  const today = useToday()
  const rangeKey: InsightsRange = isInsightsRange(query.range) ? query.range : DEFAULT_RANGE

  // All Time is anchored to the first sale ever recorded, which also decides
  // whether that view buckets by day, week or month (see range.ts).
  const earliestSale = useMemo(() => {
    let earliest: string | null = null
    for (const sale of sales) if (earliest === null || sale.date < earliest) earliest = sale.date
    return earliest
  }, [sales])

  const range = useMemo(
    () => resolveRange(rangeKey, today, earliestSale),
    [rangeKey, today, earliestSale],
  )

  const firstRun = sales.length === 0

  return (
    <div className="insights shell-stack">
      <PageHeader title="Insights" subtitle="How the numbers are moving" showStoredLocally />

      <SegmentedControl
        className="insights__range"
        label="Time range"
        options={RANGE_OPTIONS}
        value={rangeKey}
        onChange={(next) => setQuery({ range: next })}
      />

      {firstRun ? (
        // §57: a new ledger is a real state, not an error. Say what will appear.
        <EmptyState
          headingLevel={2}
          title="Your sales history will appear here."
          body="Record a sale and this screen fills in: the trend line, your personal records and how each category is doing."
          action={
            <Button variant="primary" onClick={() => addSale.open()}>
              Add Sale
            </Button>
          }
        />
      ) : (
        <>
          <PerformanceSection sales={sales} goals={goals} settings={settings} range={range} />
          <TrendSection sales={sales} goals={goals} settings={settings} range={range} />
          <PaceSection sales={sales} goals={goals} settings={settings} today={today} />
          <RecordsSection sales={sales} goals={goals} settings={settings} today={today} />
          <CategorySection
            sales={sales}
            categories={categories}
            settings={settings}
            range={range}
          />
        </>
      )}
    </div>
  )
}

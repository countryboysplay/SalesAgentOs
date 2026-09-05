/**
 * Home — spec §9–13, §52–54. The primary experience, always opening on Today.
 *
 * This screen computes nothing. Every figure below comes out of src/core/calc
 * (totals, pace, records) and is formatted at the render boundary by
 * src/core/format. If a number here looks wrong, the bug is in the engine or in
 * the goal history, never in this file.
 */
import { useEffect, useMemo, useState } from 'react'
import { Celebration, PageHeader, useOneShot } from '@/components'
import {
  useAddSale,
  useCategories,
  useGoals,
  useProfile,
  useSales,
  useSettings,
} from '@/app/store'
import {
  annualPace,
  countByDay,
  dailyPace,
  dailySeries,
  monthlyPace,
  monthlySeries,
  personalRecords,
  totalsForDay,
  totalsForYear,
} from '@/core/calc'
import { addDays, monthKey, todayIso } from '@/core/date'
import { formatDate } from '@/core/format'
import type { IsoDate, Sale } from '@/core/types'
import TodayScoreCard from './TodayScoreCard'
import QuickPerformanceStrip from './QuickPerformanceStrip'
import PaceCard from './PaceCard'
import TodaySalesList from './TodaySalesList'
import SaleDetailsSheet from './SaleDetailsSheet'
import { SaleEditorSheet } from './AddSaleSheet'
import './HomeScreen.css'

const NO_SALES: Sale[] = []

/** "Good afternoon" — §9. Local wall clock, nothing else. */
function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** How often the wall clock is re-read while Home is on screen. */
const CLOCK_TICK_MS = 30_000

interface Clock {
  today: IsoDate
  hour: number
}

function readClock(): Clock {
  return { today: todayIso(), hour: new Date().getHours() }
}

/**
 * The local day and hour, kept current.
 *
 * An installed PWA is left open for days, so reading todayIso() once at render
 * meant that at 00:05 the header still said yesterday and "Today" still totalled
 * yesterday — while a sale added right then was dated correctly and therefore
 * did not appear in any figure on screen. A short poll catches midnight; the
 * visibility listener catches the far commoner case of the app being brought
 * back to the foreground after the timer was throttled or suspended.
 */
function useLocalClock(): Clock {
  const [clock, setClock] = useState<Clock>(readClock)

  useEffect(() => {
    const tick = () => {
      const next = readClock()
      // Same object identity when nothing moved, so the memoised figures below
      // are not invalidated twice a minute.
      setClock((prev) => (prev.today === next.today && prev.hour === next.hour ? prev : next))
    }

    const timer = setInterval(tick, CLOCK_TICK_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    tick()

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return clock
}

export function HomeScreen() {
  const { sales, salesById, salesByDate } = useSales()
  const { goals } = useGoals()
  const { categoriesById } = useCategories()
  const settings = useSettings()
  const profile = useProfile()
  const addSale = useAddSale()

  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const { today, hour } = useLocalClock()

  /* ------------------------------------------------------ the numbers */

  const todayTotals = useMemo(() => totalsForDay(sales, today), [sales, today])
  const daily = useMemo(() => dailyPace(sales, goals, settings, today), [sales, goals, settings, today])
  const monthly = useMemo(
    () => monthlyPace(sales, goals, settings, today, today),
    [sales, goals, settings, today],
  )
  const annual = useMemo(
    () => annualPace(sales, goals, settings, today, today),
    [sales, goals, settings, today],
  )
  const yearTotals = useMemo(() => totalsForYear(sales, today), [sales, today])
  const records = useMemo(
    () => personalRecords(sales, goals, settings, today),
    [sales, goals, settings, today],
  )
  /**
   * How many distinct days have sales — used to tell a first day from a record.
   * countByDay counts ACTIVE sales only; netByDay keyed every date it saw, so a
   * day whose single sale was cancelled counted as a trading day and the very
   * first real day fired the new-record confetti.
   */
  const daysWithSales = useMemo(() => countByDay(sales).size, [sales])

  const todaySales = salesByDate.get(today) ?? NO_SALES

  /**
   * MiniBars sparklines (§11 HUD pass) — real, already-aggregated figures,
   * never invented. Month: the last 7 calendar days, oldest first. Year: net
   * sales for each elapsed month this year, January through the current one.
   */
  const monthTrend = useMemo(
    () => dailySeries(sales, addDays(today, -6), today).map((point) => point.netSales),
    [sales, today],
  )
  const yearTrend = useMemo(() => {
    const year = Number(today.slice(0, 4))
    const elapsedMonths = Number(today.slice(5, 7))
    return monthlySeries(sales, year)
      .slice(0, elapsedMonths)
      .map((point) => point.netSales)
  }, [sales, today])

  /* --------------------------------------------------- celebration (§53) */

  const dailyReached = useOneShot(daily.status === 'goal-reached', `daily:${today}`)
  const monthlyReached = useOneShot(monthly.status === 'goal-reached', `monthly:${monthKey(today)}`)
  const annualReached = useOneShot(annual.status === 'goal-reached', `annual:${today.slice(0, 4)}`)
  const newRecord = useOneShot(
    daysWithSales > 1 && records.bestDay !== null && records.bestDay.date === today,
    `record-day:${today}`,
  )

  const celebrating = dailyReached || monthlyReached || annualReached || newRecord
  const announcement = annualReached
    ? 'Annual goal reached'
    : monthlyReached
      ? 'Monthly goal reached'
      : newRecord
        ? 'New best day'
        : 'Daily goal reached'

  /* ------------------------------------------------------------ render */

  const name = profile?.displayName?.trim()
  // Read back through the index so a delete or an id reconciliation closes the
  // sheet instead of showing a stale row.
  const detailsSale = detailsId ? (salesById.get(detailsId) ?? null) : null
  const editSale = editId ? (salesById.get(editId) ?? null) : null

  return (
    <div className="home shell-stack pad-for-nav">
      <PageHeader
        title={name ? `${greeting(hour)}, ${name}` : greeting(hour)}
        subtitle={formatDate(today, settings, 'weekday')}
        showStoredLocally
      />

      <div className="shell-split home__split">
        <div className="shell-stack home__primary">
          <TodayScoreCard
            totals={todayTotals}
            pace={daily}
            settings={settings}
            reducedMotion={settings.reducedMotion === true}
          />

          <QuickPerformanceStrip
            month={monthly}
            year={annual}
            commission={yearTotals.estimatedCommission}
            commissionEnabled={settings.commissionEnabled}
            settings={settings}
            monthTrend={monthTrend}
            yearTrend={yearTrend}
          />

          <PaceCard
            pace={monthly}
            settings={settings}
            monthLabel={formatDate(today, settings, 'monthYear')}
          />
        </div>

        <div className="shell-stack home__secondary">
          <TodaySalesList
            sales={todaySales}
            saleCount={todayTotals.saleCount}
            categoriesById={categoriesById}
            settings={settings}
            onOpenDetails={(sale) => setDetailsId(sale.id)}
            onEdit={(sale) => setEditId(sale.id)}
            onAddSale={() => addSale.open()}
          />
        </div>
      </div>

      <SaleDetailsSheet
        open={detailsSale !== null}
        sale={detailsSale}
        onClose={() => setDetailsId(null)}
        onEdit={(sale) => {
          setDetailsId(null)
          setEditId(sale.id)
        }}
      />

      <SaleEditorSheet
        open={editSale !== null}
        sale={editSale}
        onClose={() => setEditId(null)}
      />

      <Celebration
        active={celebrating}
        announcement={announcement}
        forceReducedMotion={settings.reducedMotion === true}
      />
    </div>
  )
}

export default HomeScreen

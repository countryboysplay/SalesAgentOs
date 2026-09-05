/**
 * Personal records (§29) and the goal streak (§30).
 *
 * Records are **all time on purpose**. A personal best that shrank every time
 * the agent picked a shorter range would not be a record, and §29 calls these
 * "Personal Records" — so the card states its own scope instead of following
 * the range selector.
 *
 * The streak is likewise measured as of today, walking backwards. `goalStreak`
 * in calc skips non-workdays entirely, so a weekend never breaks it; the copy
 * here says so out loud, because a streak the agent does not trust is worse
 * than no streak at all (§30: "do not punish the user for weekends").
 */
import { useMemo } from 'react'
import { Card, StatGrid, StatTile } from '@/components'
import { personalRecords } from '@/core/calc'
import { hasGoal } from '@/core/calc'
import { EM_DASH, formatCurrency, formatDate, formatMonthKey, formatNumber } from '@/core/format'
import type { Goal, IsoDate, Sale, Settings } from '@/core/types'
import { StreakIcon } from './icons'

export interface RecordsSectionProps {
  sales: readonly Sale[]
  goals: readonly Goal[]
  settings: Settings
  today: IsoDate
}

const WAITING = 'Waiting on its first entry'

export function RecordsSection({ sales, goals, settings, today }: RecordsSectionProps) {
  const records = useMemo(
    () => personalRecords(sales, goals, settings, today),
    [sales, goals, settings, today],
  )
  const dailyGoalSet = useMemo(() => hasGoal('daily', today, goals), [goals, today])

  const streakDays = records.goalStreak
  const streakValue =
    streakDays > 0
      ? `${formatNumber(streakDays, settings)} ${streakDays === 1 ? 'Workday' : 'Workdays'}`
      : EM_DASH

  const streakSub = !dailyGoalSet
    ? 'Set a daily goal and the streak starts counting.'
    : streakDays > 0
      ? 'Daily goal reached. Days off never break it.'
      : 'Reach today’s daily goal to start one. Days off never count against you.'

  return (
    <Card
      title="Personal Records"
      headerAction={<span className="insights__scope">All time</span>}
    >
      <StatGrid columns={2} className="insights__metrics">
        <StatTile
          size="sm"
          label="Best day"
          value={records.bestDay ? formatCurrency(records.bestDay.amount, settings) : EM_DASH}
          sub={records.bestDay ? formatDate(records.bestDay.date, settings, 'medium') : WAITING}
        />
        <StatTile
          size="sm"
          label="Best month"
          value={records.bestMonth ? formatCurrency(records.bestMonth.amount, settings) : EM_DASH}
          sub={
            records.bestMonth ? formatMonthKey(records.bestMonth.month, settings, 'monthYear') : WAITING
          }
        />
        <StatTile
          size="sm"
          label="Largest sale"
          value={records.largestSale ? formatCurrency(records.largestSale.amount, settings) : EM_DASH}
          sub={records.largestSale ? formatDate(records.largestSale.date, settings, 'medium') : WAITING}
        />
        <StatTile
          size="sm"
          label="Most sales in a day"
          value={
            records.mostSalesInDay ? formatNumber(records.mostSalesInDay.count, settings) : EM_DASH
          }
          sub={
            records.mostSalesInDay
              ? formatDate(records.mostSalesInDay.date, settings, 'medium')
              : WAITING
          }
          ariaLabel={
            records.mostSalesInDay
              ? `Most sales in a day: ${formatNumber(records.mostSalesInDay.count, settings)} on ${formatDate(
                  records.mostSalesInDay.date,
                  settings,
                  'long',
                )}.`
              : `Most sales in a day: none yet. ${WAITING}.`
          }
        />
      </StatGrid>

      <div className="streak">
        <p className="streak__head">
          <StreakIcon />
          <span className="eyebrow">Goal streak</span>
        </p>
        <p className="streak__value num">{streakValue}</p>
        <p className="streak__sub">{streakSub}</p>
      </div>
    </Card>
  )
}

export default RecordsSection

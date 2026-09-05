/**
 * Pace (§26, §66-68).
 *
 * Month and year are always shown as month and year — they are calendar
 * concepts, so the range selector above does not reach them, and each block
 * says which period it is describing.
 *
 * Copy rule: §52 asks for restrained warning styling and forbids
 * shame-oriented language. "Behind pace" states a number; it never scolds, and
 * "no goal set" is an invitation, never a failure.
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Button, Card, ProgressBar } from '@/components'
import { annualPace, monthlyPace, monthsRemainingInYear, requiredPerRemainingMonth } from '@/core/calc'
import { percentOf } from '@/core/money'
import { formatCurrency, formatDate, formatNumber } from '@/core/format'
import { useNavigate } from '@/app/router'
import type { Goal, IsoDate, PaceResult, Sale, Settings } from '@/core/types'
import { AheadIcon, BehindIcon, NoGoalIcon, OnTrackIcon, ReachedIcon } from './icons'

export interface PaceSectionProps {
  sales: readonly Sale[]
  goals: readonly Goal[]
  settings: Settings
  today: IsoDate
}

type Tone = 'positive' | 'accent' | 'warning' | 'neutral'

interface StatusCopy {
  text: string
  icon: ReactNode
  tone: Tone
}

/** Status as words + glyph first, tone second — colour is never the signal (§63). */
function statusCopy(pace: PaceResult, settings: Settings, period: string): StatusCopy {
  const magnitude = formatCurrency(Math.abs(pace.difference), settings)
  switch (pace.status) {
    case 'goal-reached':
      return { text: `${period} goal reached`, icon: <ReachedIcon />, tone: 'positive' }
    case 'ahead':
      return { text: `${magnitude} ahead of pace`, icon: <AheadIcon />, tone: 'positive' }
    case 'behind':
      return { text: `${magnitude} behind pace`, icon: <BehindIcon />, tone: 'warning' }
    case 'on-track':
      return { text: 'On track', icon: <OnTrackIcon />, tone: 'accent' }
    case 'no-goal':
    default:
      return { text: `No ${period.toLowerCase()} goal set`, icon: <NoGoalIcon />, tone: 'neutral' }
  }
}

interface PaceBlockProps {
  eyebrow: string
  period: string
  pace: PaceResult
  settings: Settings
  /** Extra line under the bar, e.g. the §68 required monthly average. */
  extraFootnote?: string | null
  onSetGoal: () => void
}

function PaceBlock({ eyebrow, period, pace, settings, extraFootnote, onSetGoal }: PaceBlockProps) {
  const status = statusCopy(pace, settings, period)

  if (pace.goal === null) {
    return (
      <div className="pace__block">
        <p className="eyebrow">{eyebrow}</p>
        <p className="pace__figure num">{formatCurrency(pace.actual, settings)}</p>
        <p className={`pace__status pace__status--${status.tone}`}>
          {status.icon}
          <span>{status.text}</span>
        </p>
        <p className="insights__note">
          Add a {period.toLowerCase()} goal and this becomes a pace line.
        </p>
        <Button variant="secondary" onClick={onSetGoal}>
          Set {period.toLowerCase()} goal
        </Button>
      </div>
    )
  }

  const footnote =
    pace.status === 'goal-reached'
      ? pace.workdaysRemaining > 0
        ? `Reached with ${formatNumber(pace.workdaysRemaining, settings)} working ${
            pace.workdaysRemaining === 1 ? 'day' : 'days'
          } still to come.`
        : 'Reached, with the working days of this period behind you.'
      : pace.requiredPerWorkday !== null
        ? `${formatCurrency(pace.requiredPerWorkday, settings)} a working day over the ${formatNumber(
            pace.workdaysRemaining,
            settings,
          )} ${pace.workdaysRemaining === 1 ? 'day' : 'days'} left.`
        : 'The working days of this period are behind you.'

  return (
    <div className="pace__block">
      <p className="eyebrow">{eyebrow}</p>
      <p className={`pace__status pace__status--${status.tone}`}>
        {status.icon}
        <span>{status.text}</span>
      </p>
      <ProgressBar
        label={`${period} goal progress`}
        value={pace.progress}
        markerAt={percentOf(pace.expected, pace.goal)}
        markerLabel="Expected by today"
        caption={`${formatCurrency(pace.actual, settings)} / ${formatCurrency(pace.goal, settings)}`}
        tone={status.tone}
        footnote={
          <>
            {footnote}
            {extraFootnote ? <> {extraFootnote}</> : null}
          </>
        }
      />
    </div>
  )
}

export function PaceSection({ sales, goals, settings, today }: PaceSectionProps) {
  const navigate = useNavigate()

  const { month, year, requiredMonthly, monthsLeft } = useMemo(() => {
    const monthPace = monthlyPace(sales, goals, settings, today, today)
    const yearPace = annualPace(sales, goals, settings, today, today)
    return {
      month: monthPace,
      year: yearPace,
      requiredMonthly: requiredPerRemainingMonth(yearPace, today),
      monthsLeft: monthsRemainingInYear(today),
    }
  }, [sales, goals, settings, today])

  const annualExtra =
    year.goal !== null && requiredMonthly !== null && year.status !== 'goal-reached'
      ? `That is ${formatCurrency(requiredMonthly, settings)} a month across the ${formatNumber(
          monthsLeft,
          settings,
        )} ${monthsLeft === 1 ? 'month' : 'months'} left.`
      : null

  return (
    <Card title="Pace" headerAction={<span className="insights__scope">Month and year</span>}>
      <div className="pace">
        <PaceBlock
          eyebrow={formatDate(today, settings, 'monthYear')}
          period="Monthly"
          pace={month}
          settings={settings}
          onSetGoal={() => navigate('/settings/goals')}
        />
        <PaceBlock
          eyebrow={today.slice(0, 4)}
          period="Annual"
          pace={year}
          settings={settings}
          extraFootnote={annualExtra}
          onSetGoal={() => navigate('/settings/goals')}
        />
      </div>
    </Card>
  )
}

export default PaceSection

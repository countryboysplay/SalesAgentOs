/**
 * Today's Score Card — spec §10. The largest component on the screen.
 *
 * Every figure here arrives pre-computed from src/core/calc; this file only
 * decides how it reads. When no daily goal is in force it drops the percentage
 * language entirely and simply states "$742 Sold Today" (§10).
 */
import { Card, ProgressBar, StatGrid, StatTile } from '@/components'
import { formatCurrency, formatPercent, formatSignedCurrency } from '@/core/format'
import type { FormatSettings } from '@/core/format'
import type { PaceResult, PaceStatus, PeriodTotals } from '@/core/types'
import { PaceGlyph, paceTone, paceWord } from './paceStatus'

export interface TodayScoreCardProps {
  totals: PeriodTotals
  pace: PaceResult
  settings: FormatSettings
}

/**
 * Pace answers "am I ahead of where I should be by now?", and on a day off
 * there is no "by now": dailyPace reports workdaysTotal 0, so expected is 0 and
 * every cent looks like a surplus. The card then read "Ahead" beside 50%.
 * When no workday has elapsed the honest reading is neither ahead nor behind,
 * only whether the goal has been met.
 */
function paceApplies(pace: PaceResult): boolean {
  return pace.workdaysTotal > 0
}

/** Goal met? Measured against the goal itself, never against `difference`. */
function goalMet(pace: PaceResult): boolean {
  return pace.goal !== null && pace.goal > 0 && pace.remaining <= 0
}

export function TodayScoreCard({ totals, pace, settings }: TodayScoreCardProps) {
  const net = formatCurrency(totals.netSales, settings)
  const hasGoal = pace.goal !== null && pace.goal > 0
  const applies = paceApplies(pace)
  const met = goalMet(pace)

  // On a non-working day the only claim worth making is "goal reached" or
  // nothing at all — 'no-goal' carries the neutral dash glyph and neutral tone.
  const displayStatus: PaceStatus = applies ? pace.status : met ? 'goal-reached' : 'no-goal'
  const tone = paceTone(displayStatus)
  // §52: state the situation, never imply fault. A day off is not a shortfall.
  const statusWord = applies || met ? paceWord(displayStatus) : 'not a working day'

  if (!hasGoal) {
    // §10: no goal, no invented comparison. Just the figure and what it is.
    return (
      <Card tone="accent" padding="lg" className="score">
        <div className="score__hero">
          <StatTile
            label="Today"
            value={net}
            sub="Sold today"
            size="hero"
            ariaLabel={`${net} sold today`}
          />
        </div>
        <SupportingStats totals={totals} pace={pace} settings={settings} hasGoal={false} />
      </Card>
    )
  }

  const goal = formatCurrency(pace.goal ?? 0, settings)
  // formatPercent, not local rounding: the Month card renders the same fraction,
  // and 99.6% must not read as 100% here and 99.6% there.
  const percent = formatPercent(pace.progress, settings)

  return (
    <Card tone="accent" padding="lg" className="score">
      <div className="score__hero">
        <StatTile
          label="Today"
          value={net}
          sub={`of ${goal} goal`}
          size="hero"
          ariaLabel={`${net} today, of a ${goal} daily goal`}
        />
        <p className={`score__percent score__percent--${tone}`}>
          <PaceGlyph status={displayStatus} className="score__percent-glyph" />
          <span className="num">{percent}</span>
          <span className="sr-only">of your daily goal — {statusWord}</span>
        </p>
      </div>

      <ProgressBar
        value={pace.progress}
        label="Daily goal progress"
        caption={`${net} of ${goal}`}
        hideValueLabel
        tone={tone}
        size="lg"
      />

      <SupportingStats totals={totals} pace={pace} settings={settings} hasGoal />
    </Card>
  )
}

/** "3 Sales · $247 Avg Sale · +$242 Above Goal" (§10). */
function SupportingStats({
  totals,
  pace,
  settings,
  hasGoal,
}: {
  totals: PeriodTotals
  pace: PaceResult
  settings: FormatSettings
  hasGoal: boolean
}) {
  const count = totals.saleCount
  // Against the GOAL, not against `difference` (which is actual − expected and
  // therefore equals the whole day's takings on a non-workday, where expected
  // is 0). pace.remaining is the selector's own goal-shortfall figure.
  const above = goalMet(pace)
  // A presentation difference between two figures the selector already gives —
  // integer cents, and identical to pace.difference on a working day.
  const surplus = pace.actual - (pace.goal ?? 0)
  // Above goal reads as a signed surplus (+$242); below goal reads as work
  // still to do, which is the encouraging framing §52 asks for.
  const goalValue = above
    ? formatSignedCurrency(surplus, settings)
    : formatCurrency(pace.remaining, settings)

  return (
    <StatGrid columns={hasGoal ? 3 : 2} className="score__stats">
      <StatTile
        label="Sales"
        value={String(count)}
        sub="recorded today"
        size="sm"
        ariaLabel={`${count} ${count === 1 ? 'sale' : 'sales'} recorded today`}
      />
      <StatTile
        label="Avg sale"
        value={formatCurrency(totals.averageSale, settings)}
        sub="per sale"
        size="sm"
      />
      {hasGoal && (
        <StatTile
          label={above ? 'Above goal' : 'To goal'}
          value={goalValue}
          sub={above ? 'above goal' : 'still to go'}
          subTone={above ? 'positive' : 'default'}
          size="sm"
          ariaLabel={
            above
              ? `${goalValue} above your daily goal`
              : `${goalValue} still to go to reach your daily goal`
          }
        />
      )}
    </StatGrid>
  )
}

export default TodayScoreCard

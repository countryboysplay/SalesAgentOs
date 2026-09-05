/**
 * Pace Card — spec §12, §52, §67.
 *
 * Answers "am I ahead or behind for the month?" in one line, backs it with the
 * current-versus-expected pair, and turns the gap into a plan: "You need
 * $239/day for the remaining 9 working days."
 *
 * Status is carried by a word AND a glyph as well as a colour (§63), and the
 * behind state is stated plainly with no shame language (§52).
 */
import { Card, ProgressBar, StatTile } from '@/components'
import { Link, ROUTES } from '@/app/router'
import { percentOf } from '@/core/money'
import { formatCurrency, formatPercent } from '@/core/format'
import type { FormatSettings } from '@/core/format'
import type { Cents, PaceResult } from '@/core/types'
import { PaceGlyph, paceTone, paceWord } from './paceStatus'

export interface PaceCardProps {
  pace: PaceResult
  settings: FormatSettings
  /** The month in prose, e.g. "September 2026". Locale-formatted by the caller. */
  monthLabel: string
}

/**
 * Sign presentation, not calculation: PaceResult.difference already carries the
 * gap, and formatSignedCurrency uses the same Math.abs internally. The word
 * beside the figure ("ahead" / "behind") supplies the direction.
 */
function magnitude(cents: Cents, settings: FormatSettings): string {
  return formatCurrency(Math.abs(cents), settings)
}

export function PaceCard({ pace, settings, monthLabel }: PaceCardProps) {
  const tone = paceTone(pace.status)
  const word = paceWord(pace.status)

  if (pace.status === 'no-goal') {
    return (
      <Card padding="md" className="pace pace--quiet">
        <p className="eyebrow">Monthly pace</p>
        <p className="pace__quiet-line num">
          {formatCurrency(pace.actual, settings)}{' '}
          <span className="pace__quiet-unit">recorded in {monthLabel}</span>
        </p>
        <p className="pace__note">
          Set a monthly goal and this card will tell you whether you are ahead or behind.{' '}
          <Link to={ROUTES.settingsGoals}>Set a monthly goal</Link>
        </p>
      </Card>
    )
  }

  const goal = pace.goal ?? 0
  const reached = pace.status === 'goal-reached'

  const headline = reached
    ? formatCurrency(pace.actual, settings)
    : pace.status === 'on-track'
      ? formatCurrency(pace.actual, settings)
      : magnitude(pace.difference, settings)

  const headlineSub = reached
    ? `${formatPercent(pace.progress, settings)} of ${formatCurrency(goal, settings)}`
    : pace.status === 'on-track'
      ? `Right on the ${formatCurrency(pace.expected, settings)} expected by today`
      : pace.status === 'ahead'
        ? 'ahead of where you need to be'
        : 'behind where you need to be'

  return (
    <Card padding="md" className="pace">
      <div className="pace__head">
        <StatTile
          label="Monthly pace"
          value={headline}
          size="lg"
          tone={tone === 'neutral' ? 'default' : tone}
          ariaLabel={`Monthly pace for ${monthLabel}: ${word}. ${headline} ${headlineSub}.`}
        />
        <p className={`pace__status pace__status--${tone}`}>
          <PaceGlyph status={pace.status} className="pace__status-glyph" />
          {word}
        </p>
      </div>

      <p className="pace__sub">{headlineSub}</p>

      <ProgressBar
        value={pace.progress}
        label={`Monthly goal progress for ${monthLabel}`}
        // percentOf lives in core/money so the tick and the bar share one scale
        // — the screen never divides cents of its own (§51).
        markerAt={percentOf(pace.expected, goal)}
        markerLabel="Expected by today"
        tone={tone}
        hideValueLabel
        size="md"
      />

      <dl className="pace__figures">
        <div className="pace__figure">
          <dt className="eyebrow">Current</dt>
          <dd className="num pace__figure-value">{formatCurrency(pace.actual, settings)}</dd>
        </div>
        <div className="pace__figure">
          <dt className="eyebrow">Expected by today</dt>
          <dd className="num pace__figure-value">{formatCurrency(pace.expected, settings)}</dd>
        </div>
      </dl>

      <p className="pace__note">
        <RequiredLine pace={pace} settings={settings} />
      </p>
    </Card>
  )
}

/** The §12 / §67 secondary line: what today's gap means per working day. */
function RequiredLine({ pace, settings }: { pace: PaceResult; settings: FormatSettings }) {
  const goal = formatCurrency(pace.goal ?? 0, settings)

  if (pace.remaining <= 0) {
    return <>Past {goal} for the month. Everything from here is on top.</>
  }

  if (pace.requiredPerWorkday === null) {
    return (
      <>
        {formatCurrency(pace.remaining, settings)} to go, and this is the last working day of the
        month.
      </>
    )
  }

  const days = pace.workdaysRemaining
  return (
    <>
      You need {formatCurrency(pace.requiredPerWorkday, settings)}/day for the remaining {days}{' '}
      working {days === 1 ? 'day' : 'days'} to reach {goal}.
    </>
  )
}

export default PaceCard

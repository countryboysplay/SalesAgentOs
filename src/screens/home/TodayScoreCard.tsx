/**
 * Today's Score Card — spec §10. The largest component on the screen, and the
 * flagship for the command-center HUD pass: a glass panel, an animated hero
 * figure and an arc gauge for the daily goal.
 *
 * Every figure here arrives pre-computed from src/core/calc; this file only
 * decides how it reads. When no daily goal is in force it drops the percentage
 * language entirely and simply states "$742 Sold Today" (§10).
 */
import { useEffect, useRef, useState } from 'react'
import { ArcGauge, Card, StatGrid, StatTile } from '@/components'
import { formatCurrency, formatPercent, formatSignedCurrency } from '@/core/format'
import type { FormatSettings } from '@/core/format'
import type { Cents, PaceResult, PaceStatus, PeriodTotals } from '@/core/types'
import { PaceGlyph, paceTone, paceWord } from './paceStatus'

export interface TodayScoreCardProps {
  totals: PeriodTotals
  pace: PaceResult
  settings: FormatSettings
  /** Settings.reducedMotion — gates the hero count-up (§5 motion rule). */
  reducedMotion?: boolean
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

/**
 * True while the OS or Settings > Appearance says to skip motion. Checked via
 * matchMedia directly (mirroring the approved mockup's own gate) and ORed with
 * the `reducedMotion` prop so Settings.reducedMotion — which already zeroes
 * every `--dur-*` token app-wide via `data-reduced-motion` — also stops this
 * one JS-driven tween, the one animation on the screen CSS alone cannot reach.
 */
function useEffectiveReducedMotion(forced: boolean): boolean {
  const [systemReduced, setSystemReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setSystemReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return forced || systemReduced
}

const COUNT_UP_MS = 450

/**
 * Tweens the hero figure from its previous cents value to `target` whenever
 * `target` changes — never on first mount, so the very first paint always
 * shows the real total instead of animating up from zero. Cubic ease-out,
 * matching the approved mockup's own easing curve.
 */
function useCountUp(target: Cents, reducedMotion: boolean): Cents {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      displayRef.current = target
      setDisplay(target)
      return
    }
    if (displayRef.current === target) return

    if (reducedMotion) {
      displayRef.current = target
      setDisplay(target)
      return
    }

    const from = displayRef.current
    const delta = target - from
    const start = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_UP_MS)
      const eased = 1 - Math.pow(1 - p, 3)
      const next = Math.round(from + delta * eased)
      displayRef.current = next
      setDisplay(next)
      if (p < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, reducedMotion])

  return display
}

export function TodayScoreCard({ totals, pace, settings, reducedMotion = false }: TodayScoreCardProps) {
  const effectiveReducedMotion = useEffectiveReducedMotion(reducedMotion)
  const heroCents = useCountUp(totals.netSales, effectiveReducedMotion)
  const net = formatCurrency(heroCents, settings)
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
      <Card tone="glass" padding="lg" className="score">
        <div className="score__hero">
          <StatTile
            label="Today"
            value={net}
            sub="Sold today"
            size="hero"
            className="score__hero-figure"
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
    <Card tone="glass" padding="lg" className="score">
      <div className="score__hero">
        <StatTile
          label="Today"
          value={net}
          sub={`of ${goal} goal`}
          size="hero"
          className="score__hero-figure"
          ariaLabel={`${net} today, of a ${goal} daily goal`}
        />
        <ArcGauge
          progress={pace.progress}
          valueLabel={percent}
          unitLabel="of goal"
          tone={tone}
          label={`${percent} of your ${goal} daily goal — ${statusWord}`}
        />
      </div>

      <p className={`score__status score__status--${tone}`}>
        <PaceGlyph status={displayStatus} className="score__status-glyph" />
        {statusWord}
      </p>

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

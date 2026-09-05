/**
 * Settings > Goals (§32).
 *
 * The one thing this screen must get right is that a goal change is
 * PROSPECTIVE. Nothing here edits a goal row: every save goes through
 * `setGoal(type, amount, { effectiveFrom })` and the repository does the
 * interval versioning. The screen's job is to make that behaviour legible
 * before the user commits — a live preview of the new rule and of the history
 * it leaves alone — and to show the resulting timeline afterwards.
 */
import { useMemo, useState } from 'react'
import { Button, Card, useToast } from '@/components'
import { useActions, useGoals, useSettings } from '@/app/store'
import { addDays, startOfMonth, startOfYear, todayIso } from '@/core/date'
import { formatCurrency, formatDate } from '@/core/format'
import type { Goal, GoalType, IsoDate, Settings } from '@/core/types'
import {
  goalCoveringDate,
  goalHistory,
  goalPeriodNoun,
  goalTypeLabel,
  goalUnitSuffix,
  prospectivePreview,
} from './goalHistory'
import { Note, Row, SettingsPage, TextField, Toggle, centsToInput, parseMoneyInput } from './parts'

const GOAL_TYPES: GoalType[] = ['daily', 'monthly', 'annual']

const HELPER: Record<GoalType, string> = {
  daily: 'What a good day looks like. Drives the Today card and your goal streak.',
  monthly:
    'The number the month is measured against. Drives monthly pace and the required-per-workday figure.',
  annual: 'The year-long target. Drives annual pace on Insights.',
}

/** First day of the period a goal of this type is measured over. */
function periodStart(type: GoalType, today: IsoDate): IsoDate {
  if (type === 'monthly') return startOfMonth(today)
  if (type === 'annual') return startOfYear(today)
  return today
}

export default function GoalsSettings() {
  const today = todayIso()
  const settings = useSettings()
  const { goalsByType, goalFor } = useGoals()

  return (
    <SettingsPage title="Goals" subtitle="Daily, monthly and annual targets" storedLocally>
      <Card tone="flat" padding="md">
        <Note>
          <strong>Goal changes apply going forward.</strong> The days and months you have already
          worked keep the goal they were measured against, so a new target never quietly rewrites
          how you did last month.
        </Note>
      </Card>

      {GOAL_TYPES.map((type) => (
        <GoalCard
          key={type}
          type={type}
          today={today}
          settings={settings}
          rows={goalsByType[type]}
          active={goalFor(type, today)}
        />
      ))}
    </SettingsPage>
  )
}

interface GoalCardProps {
  type: GoalType
  today: IsoDate
  settings: Settings
  /** Every interval ever recorded for this goal type, oldest first. */
  rows: Goal[]
  /** The interval in force today, or null when the goal is off. */
  active: Goal | null
}

function GoalCard({ type, today, settings, rows, active }: GoalCardProps) {
  const { setGoal } = useActions()
  const { success } = useToast()

  const [draft, setDraft] = useState(() => (active ? centsToInput(active.amount) : ''))
  const [restate, setRestate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suffix = goalUnitSuffix(type)

  // Restating the current period is the §32 "unless the user explicitly chooses
  // otherwise" escape hatch. It is only offered when it would actually change
  // something — on the 1st of the month the two dates are already identical.
  const start = periodStart(type, today)
  const canRestate = type !== 'daily' && start !== today
  const effectiveFrom = canRestate && restate ? start : today

  const draftCents = parseMoneyInput(draft)
  const amountChanged = active !== null && draftCents !== null && draftCents !== active.amount
  const startChanged = active !== null && canRestate && restate && draftCents !== null
  const pending = amountChanged || startChanged

  const history = useMemo(
    () => goalHistory(rows, type, today, settings),
    [rows, type, today, settings],
  )

  const preview = useMemo(() => {
    if (!pending) return null
    // The interval that will keep covering everything before the new start
    // date — resolved by the shared rule, not by a sort of our own.
    const previous = goalCoveringDate(type, rows, addDays(effectiveFrom, -1))
    return prospectivePreview(type, draftCents, true, effectiveFrom, previous, settings)
  }, [pending, rows, effectiveFrom, type, draftCents, settings])

  function save() {
    const cents = parseMoneyInput(draft)
    if (cents === null) {
      setError('Enter a goal amount, for example 10000.')
      return
    }
    if (cents === 0) {
      setError('A goal of $0 is not a goal. Turn the goal off instead.')
      return
    }
    setError(null)
    setGoal(type, cents, { effectiveFrom })
    setRestate(false)
    success(`${goalTypeLabel(type)} updated`, {
      detail: `${formatCurrency(cents, settings)}${suffix} from ${formatDate(effectiveFrom, settings, 'long')} onward`,
      key: `goal-${type}`,
    })
  }

  function toggle(next: boolean) {
    if (!next) {
      // enabled:false routes to disableGoal, which closes the open interval and
      // writes a disabled row. No history is deleted.
      setGoal(type, active?.amount ?? 0, { enabled: false, effectiveFrom: today })
      success(`${goalTypeLabel(type)} turned off`, {
        detail: `Past ${goalPeriodNoun(type)} keep the goal they were measured against.`,
        key: `goal-${type}`,
      })
      return
    }

    // Turning a goal back on needs an amount: whatever is in the field, or the
    // last figure that was in force before it was switched off.
    const lastEnabled = [...rows]
      .filter((g) => g.enabled && g.amount > 0)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]
    const cents = parseMoneyInput(draft) ?? lastEnabled?.amount ?? null

    if (cents === null || cents === 0) {
      setError('Enter an amount to turn this goal back on.')
      return
    }
    setError(null)
    setDraft(centsToInput(cents))
    setGoal(type, cents, { effectiveFrom: today })
    success(`${goalTypeLabel(type)} turned on`, {
      detail: `${formatCurrency(cents, settings)}${suffix} from ${formatDate(today, settings, 'long')} onward`,
      key: `goal-${type}`,
    })
  }

  return (
    <Card
      title={goalTypeLabel(type)}
      headerAction={
        <Toggle
          checked={active !== null}
          onChange={toggle}
          label={`${goalTypeLabel(type)} on or off`}
        />
      }
    >
      <div className="shell-stack">
        <Note>{HELPER[type]}</Note>

        {active !== null ? (
          <>
            <TextField
              required
              label={`Amount${suffix}`}
              value={draft}
              onChange={(v) => {
                setDraft(v)
                setError(null)
              }}
              onEnter={save}
              prefix="$"
              inputMode="decimal"
              numeric
              className="set-field--wide"
              placeholder="0"
              error={error}
              hint={
                pending
                  ? undefined
                  : `In force now: ${formatCurrency(active.amount, settings)}${suffix}`
              }
            />

            {canRestate && (
              <Row
                label={`Apply from the start of this ${type === 'monthly' ? 'month' : 'year'}`}
                sub={`Restates ${formatDate(start, settings, 'long')} onward instead of today onward. Earlier ${goalPeriodNoun(type)} are still left alone.`}
                control={
                  <Toggle
                    checked={restate}
                    onChange={setRestate}
                    label={`Apply the new ${goalTypeLabel(type).toLowerCase()} from ${formatDate(start, settings, 'long')}`}
                  />
                }
              />
            )}

            {preview && (
              <div className="set-preview">
                <p className="set-preview__line">
                  <span className="set-preview__marker">New</span>
                  <span>{preview.forward}</span>
                </p>
                {preview.history && (
                  <p className="set-preview__line">
                    <span className="set-preview__marker">Unchanged</span>
                    <span>{preview.history}</span>
                  </p>
                )}
              </div>
            )}

            <div className="set-actions set-actions--hug">
              <Button variant="primary" onClick={save} disabled={!pending}>
                Save {goalTypeLabel(type)}
              </Button>
              {pending && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft(centsToInput(active.amount))
                    setRestate(false)
                    setError(null)
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <Note>
              No {goalTypeLabel(type).toLowerCase()} is in force. Progress for{' '}
              {goalPeriodNoun(type)} shows as untargeted until you turn it back on. Past{' '}
              {goalPeriodNoun(type)} keep the goals they were measured against.
            </Note>
            <TextField
              required
              label={`Amount${suffix}`}
              value={draft}
              onChange={(v) => {
                setDraft(v)
                setError(null)
              }}
              onEnter={() => toggle(true)}
              prefix="$"
              inputMode="decimal"
              numeric
              className="set-field--wide"
              placeholder="0"
              error={error}
              hint={`Takes effect ${formatDate(today, settings, 'long')} onward.`}
            />
            <div className="set-actions set-actions--hug">
              <Button variant="secondary" onClick={() => toggle(true)}>
                Turn on {goalTypeLabel(type)}
              </Button>
            </div>
          </>
        )}

        {history.length > 0 && (
          <div>
            <p className="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>
              Goal history
            </p>
            <div className="set-history">
              {history.map((entry) => (
                <div
                  key={entry.key}
                  className={`set-history__item${entry.current ? ' set-history__item--current' : ''}`}
                >
                  <span className="set-history__period">
                    {entry.period}
                    {entry.current && <span className="sr-only"> (in force now)</span>}
                  </span>
                  <span
                    className={`set-history__amount${entry.enabled ? '' : ' set-history__amount--off'}`}
                  >
                    {entry.amount}
                  </span>
                </div>
              ))}
            </div>
            {history.length > 1 && (
              <Note quiet>
                A report for a past period uses the goal from that period, not the one in force
                today.
              </Note>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

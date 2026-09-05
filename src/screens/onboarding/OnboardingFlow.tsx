/**
 * First launch + initial setup — spec §7 (welcome) and §8 (five steps).
 *
 * The whole flow is designed to finish in under two minutes: six screens, one
 * decision each, nothing required except a name. Every field can be skipped
 * except that name, and every step is reachable backwards.
 *
 * The shell routes here automatically while Settings.onboardingCompletedAt is
 * null and routes away the instant completeOnboarding() is called (§7).
 */
import { useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { BrandMark, Button, Chip } from '@/components'
import { useActions, useSettings, useStoreStatus } from '@/app/store'
import type { OnboardingPayload } from '@/app/store'
import { requestPersistentStorage } from '@/data'
import { parseAmountToCents } from '@/core/money'
import { formatBasisPoints, formatCurrency } from '@/core/format'
import type { GoalType, Weekday } from '@/core/types'
import './OnboardingFlow.css'

/* ------------------------------------------------------------------ config */

/** 0 = Sunday … 6 = Saturday, matching Weekday / Date#getDay(). */
const WEEKDAYS: ReadonlyArray<{ value: Weekday; short: string; full: string }> = [
  { value: 0, short: 'Sun', full: 'Sunday' },
  { value: 1, short: 'Mon', full: 'Monday' },
  { value: 2, short: 'Tue', full: 'Tuesday' },
  { value: 3, short: 'Wed', full: 'Wednesday' },
  { value: 4, short: 'Thu', full: 'Thursday' },
  { value: 5, short: 'Fri', full: 'Friday' },
  { value: 6, short: 'Sat', full: 'Saturday' },
]

const DEFAULT_WORKDAYS: Weekday[] = [1, 2, 3, 4, 5]

/** Spec §8 shows these figures as examples, so they are hints — never values. */
const GOAL_FIELDS: ReadonlyArray<{
  type: GoalType
  title: string
  blurb: string
  placeholder: string
}> = [
  { type: 'daily', title: 'Daily goal', blurb: 'What a good day looks like.', placeholder: '500' },
  {
    type: 'monthly',
    title: 'Monthly goal',
    blurb: 'The number the month is measured against.',
    placeholder: '10,000',
  },
  { type: 'annual', title: 'Annual goal', blurb: 'The year-end target.', placeholder: '120,000' },
]

const TOTAL_STEPS = 5

interface GoalDraft {
  enabled: boolean
  text: string
}

type GoalDrafts = Record<GoalType, GoalDraft>

const EMPTY_GOALS: GoalDrafts = {
  daily: { enabled: false, text: '' },
  monthly: { enabled: false, text: '' },
  annual: { enabled: false, text: '' },
}

/** A rate over 100% is a typo, not a commission plan. */
const MAX_RATE_BASIS_POINTS = 10_000

/* --------------------------------------------------------- session draft */

interface OnboardingDraft {
  displayName: string
  initials: string
  goals: GoalDrafts
  commissionEnabled: boolean
  rateText: string
  workdays: Weekday[]
}

/**
 * The answers from the attempt that is in flight.
 *
 * When completeOnboarding fails to write, the store rolls the settings back,
 * onboardingCompletedAt returns to null, and the shell re-gates — mounting a
 * BRAND NEW OnboardingFlow. Nothing was saved, so the gate is right to hold,
 * but five steps of answers used to vanish with the old component instance.
 * Module scope outlives the remount; React state does not.
 */
let sessionDraft: OnboardingDraft | null = null

/* ------------------------------------------------------------------- icons */

const CheckGlyph = () => (
  <svg className="ob__weekday-check" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M13.3 4.3 6.4 11.2 2.7 7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/* ------------------------------------------------------------------ pieces */

function Progress({ step }: { step: number }) {
  return (
    <div className="ob__progress">
      <div className="ob__dots" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span key={i} className={`ob__dot${i < step ? ' ob__dot--done' : ''}`} />
        ))}
      </div>
      <span className="ob__step-count">
        Step {step} of {TOTAL_STEPS}
      </span>
    </div>
  )
}

function Shell({ step, children }: { step: number; children: ReactNode }) {
  return (
    <div className="ob">
      <div className="ob__inner">
        <Progress step={step} />
        {children}
      </div>
    </div>
  )
}

function Actions({
  onBack,
  primaryLabel,
  submit = false,
  disabled = false,
  secondary,
}: {
  onBack: () => void
  primaryLabel: string
  submit?: boolean
  disabled?: boolean
  secondary?: ReactNode
}) {
  return (
    <div className="ob__actions">
      <Button
        variant="primary"
        size="lg"
        block
        type={submit ? 'submit' : 'button'}
        disabled={disabled}
      >
        {primaryLabel}
      </Button>
      <div className="ob__actions-row">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        {secondary}
      </div>
    </div>
  )
}

/**
 * Percent to basis points without inventing float maths: parseAmountToCents
 * already turns '5' into 500 and '3.25' into 325, which is exactly the
 * basis-point scale (types.ts BasisPoints, §33).
 */
function parseRateToBasisPoints(text: string): number | null {
  const parsed = parseAmountToCents(text.trim())
  if (parsed === null || parsed < 0) return null
  return parsed
}

/* -------------------------------------------------------------------- flow */

export function OnboardingFlow() {
  const settings = useSettings()
  const { completeOnboarding } = useActions()
  const { persistError } = useStoreStatus()

  /**
   * A fresh mount with a persist error already on the board is the failed-write
   * path: the same session, the same unsaved answers. Pick them up and land on
   * the summary, where the button that failed is. Any other mount — a first
   * launch, or Reset App later in the session — starts clean.
   */
  const [resumed] = useState<OnboardingDraft | null>(() =>
    persistError !== null ? sessionDraft : null,
  )

  const [step, setStep] = useState(resumed ? TOTAL_STEPS : 0) // 0 = welcome, 1..5 = setup
  const [displayName, setDisplayName] = useState(resumed?.displayName ?? '')
  const [initials, setInitials] = useState(resumed?.initials ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [goals, setGoals] = useState<GoalDrafts>(resumed?.goals ?? EMPTY_GOALS)
  const [commissionEnabled, setCommissionEnabled] = useState(resumed?.commissionEnabled ?? true)
  const [rateText, setRateText] = useState(resumed?.rateText ?? '5')
  const [rateError, setRateError] = useState<string | null>(null)
  const [workdays, setWorkdays] = useState<Weekday[]>(resumed?.workdays ?? DEFAULT_WORKDAYS)
  const submitted = useRef(false)

  const trimmedName = displayName.trim()
  const rateBasisPoints = parseRateToBasisPoints(rateText)

  /**
   * The rate that will actually be stored — null when commission is off.
   *
   * The summary and the payload read this same value, so the summary can never
   * again say "Not tracked" while the write turns commission on at the default
   * rate.
   */
  const savedRate: number | null = commissionEnabled
    ? (rateBasisPoints ?? settings.defaultCommissionRate)
    : null

  /** What is wrong with the typed rate, in the agent's words. §8. */
  const rateProblem: string | null = !commissionEnabled
    ? null
    : rateText.trim() === ''
      ? 'Add a rate, or choose No above.'
      : rateBasisPoints === null
        ? 'Use a number, like 5 or 3.25. The % sign is added for you.'
        : rateBasisPoints > MAX_RATE_BASIS_POINTS
          ? 'That is more than the whole sale. Try a rate up to 100.'
          : null

  const enabledGoals = useMemo(() => {
    const out: OnboardingPayload['goals'] = {}
    for (const { type } of GOAL_FIELDS) {
      const draft = goals[type]
      if (!draft.enabled) continue
      const amount = parseAmountToCents(draft.text)
      if (amount === null || amount <= 0) continue
      out[type] = { amount, enabled: true }
    }
    return out
  }, [goals])

  const back = () => setStep((s) => Math.max(0, s - 1))
  const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1))
  const advance = (event: FormEvent) => {
    event.preventDefault()
    next()
  }

  const setGoal = (type: GoalType, patch: Partial<GoalDraft>) =>
    setGoals((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }))

  const toggleWorkday = (day: Weekday) =>
    setWorkdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    )

  const submitCommission = (event: FormEvent) => {
    event.preventDefault()
    if (rateProblem !== null) {
      setRateError(rateProblem)
      return
    }
    setRateError(null)
    next()
  }

  const submitName = (event: FormEvent) => {
    event.preventDefault()
    if (trimmedName === '') {
      setNameError('Add a name so the app knows what to call you.')
      return
    }
    setNameError(null)
    next()
  }

  const finish = () => {
    if (submitted.current) return
    submitted.current = true

    // Kept where a remount can find it: if the write fails, the shell tears this
    // component down and builds a new one, and these answers are all there is.
    sessionDraft = { displayName, initials, goals, commissionEnabled, rateText, workdays }

    // This press is the strongest user gesture the browser will see, which is
    // when a request for durable local storage is most likely to be granted.
    void requestPersistentStorage()

    completeOnboarding({
      profile: {
        displayName: trimmedName,
        initials: initials.trim() === '' ? null : initials.trim().toUpperCase(),
      },
      goals: enabledGoals,
      settings: {
        workdays,
        commissionEnabled,
        // Exactly the figure the summary showed.
        defaultCommissionRate: savedRate ?? settings.defaultCommissionRate,
      },
    })
  }

  /* ------------------------------------------------------------- welcome */

  if (step === 0) {
    return (
      <div className="ob ob--welcome">
        <div className="ob__inner">
          <div className="ob__brand">
            <BrandMark size={40} className="ob__mark" />
            <span>
              SalesAgent<b>OS</b>
            </span>
          </div>

          <div className="ob__body">
            <h1 className="ob__title">Track the number that matters. Yours.</h1>
            <p className="ob__lede">
              Your sales, goals, pace and performance — without accounts, servers or spreadsheets.
            </p>
          </div>

          <div className="ob__actions">
            <Button variant="primary" size="lg" block onClick={next}>
              Set Up My Tracker
            </Button>
            <p className="ob__note">Your sales data stays on this device.</p>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------- step 1: agent */

  if (step === 1) {
    return (
      <Shell step={1}>
        <form className="ob__body" onSubmit={submitName}>
          <div>
            <h1 className="ob__title">What should we call you?</h1>
            <p className="ob__lede">This only ever appears on your own screen.</p>
          </div>

          <div className="ob__fields">
            <div className="ob__field">
              <label className="ob__label" htmlFor="ob-name">
                Display name
              </label>
              <input
                id="ob-name"
                className="ob__input"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  if (nameError) setNameError(null)
                }}
                placeholder="Jonathan"
                autoComplete="given-name"
                autoFocus
                aria-required="true"
                aria-describedby={nameError ? 'ob-name-error' : undefined}
                aria-invalid={nameError ? true : undefined}
              />
              {nameError && (
                <p className="ob__error" id="ob-name-error" role="alert">
                  {nameError}
                </p>
              )}
            </div>

            <div className="ob__field">
              <label className="ob__label" htmlFor="ob-initials">
                Initials <span className="ob__optional">— optional</span>
              </label>
              <input
                id="ob-initials"
                className="ob__input"
                value={initials}
                onChange={(e) => setInitials(e.target.value.slice(0, 4))}
                placeholder={trimmedName === '' ? 'JL' : trimmedName.slice(0, 2).toUpperCase()}
                maxLength={4}
                aria-describedby="ob-initials-hint"
              />
              <p className="ob__hint" id="ob-initials-hint">
                A short label for exports. Skip it if you like.
              </p>
            </div>
          </div>

          <Actions onBack={back} submit primaryLabel="Continue" />
        </form>
      </Shell>
    )
  }

  /* ------------------------------------------------------- step 2: goals */

  if (step === 2) {
    return (
      <Shell step={2}>
        <form className="ob__body" onSubmit={advance}>
          <div>
            <h1 className="ob__title">Set your goals</h1>
            <p className="ob__lede">
              Turn on the ones you actually work to. Add or change them any time.
            </p>
          </div>

          <div className="ob__fields">
            {GOAL_FIELDS.map(({ type, title, blurb, placeholder }) => (
              <div className="ob__goal" key={type}>
                <div className="ob__goal-head">
                  <span className="ob__goal-name">
                    <span className="ob__goal-title">{title}</span>
                    <span className="ob__hint">{blurb}</span>
                  </span>
                  <Chip
                    selected={goals[type].enabled}
                    onClick={() => setGoal(type, { enabled: !goals[type].enabled })}
                    ariaLabel={`${title}, currently ${goals[type].enabled ? 'on' : 'off'}`}
                  >
                    {goals[type].enabled ? 'On' : 'Off'}
                  </Chip>
                </div>

                {goals[type].enabled && (
                  <div className="ob__field">
                    <label className="sr-only" htmlFor={`ob-goal-${type}`}>
                      {title} amount
                    </label>
                    <div className="ob__amount">
                      <span className="ob__amount-symbol">$</span>
                      <input
                        id={`ob-goal-${type}`}
                        className="ob__input"
                        value={goals[type].text}
                        onChange={(e) => setGoal(type, { text: e.target.value })}
                        placeholder={placeholder}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-describedby={`ob-goal-${type}-hint`}
                      />
                    </div>
                    <p className="ob__hint" id={`ob-goal-${type}-hint`}>
                      For example ${placeholder}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Actions
            onBack={back}
            submit
            primaryLabel="Continue"
            secondary={
              <Button variant="ghost" onClick={() => setGoals(EMPTY_GOALS)}>
                Skip goals
              </Button>
            }
          />
        </form>
      </Shell>
    )
  }

  /* -------------------------------------------------- step 3: commission */

  if (step === 3) {
    return (
      <Shell step={3}>
        <form className="ob__body" onSubmit={submitCommission}>
          <div>
            <h1 className="ob__title">Track estimated commission?</h1>
            <p className="ob__lede">
              Every sale keeps the rate it was recorded at, so changing this later never rewrites
              what you have already earned.
            </p>
          </div>

          <div className="ob__fields">
            <div className="ob__field">
              <span className="ob__label" id="ob-commission-label">
                Commission tracking
              </span>
              <div className="ob__actions-row" role="group" aria-labelledby="ob-commission-label">
                <Button
                  variant={commissionEnabled ? 'primary' : 'secondary'}
                  onClick={() => setCommissionEnabled(true)}
                  aria-pressed={commissionEnabled}
                >
                  Yes
                </Button>
                <Button
                  variant={commissionEnabled ? 'secondary' : 'primary'}
                  onClick={() => {
                    setCommissionEnabled(false)
                    setRateError(null)
                  }}
                  aria-pressed={!commissionEnabled}
                >
                  No
                </Button>
              </div>
            </div>

            {commissionEnabled && (
              <div className="ob__field">
                <label className="ob__label" htmlFor="ob-rate">
                  Default rate
                </label>
                <div className="ob__amount ob__amount--suffix">
                  <input
                    id="ob-rate"
                    className="ob__input"
                    value={rateText}
                    onChange={(e) => {
                      setRateText(e.target.value)
                      if (rateError) setRateError(null)
                    }}
                    placeholder="5"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-describedby={rateError ? 'ob-rate-error' : 'ob-rate-hint'}
                    aria-invalid={rateError ? true : undefined}
                  />
                  <span className="ob__amount-suffix">%</span>
                </div>
                {rateError ? (
                  <p className="ob__error" id="ob-rate-error" role="alert">
                    {rateError}
                  </p>
                ) : null}
                <p className="ob__hint" id="ob-rate-hint">
                  For example 5%. Any single sale can override it.
                </p>
              </div>
            )}
          </div>

          <Actions onBack={back} submit primaryLabel="Continue" />
        </form>
      </Shell>
    )
  }

  /* ---------------------------------------------------- step 4: schedule */

  if (step === 4) {
    return (
      <Shell step={4}>
        <form className="ob__body" onSubmit={advance}>
          <div>
            <h1 className="ob__title">Which days do you work?</h1>
            <p className="ob__lede">
              Pace, streaks and every &ldquo;per day&rdquo; figure are measured against these days,
              so a quiet Sunday never counts against you.
            </p>
          </div>

          <div className="ob__field">
            <span className="ob__label" id="ob-workdays-label">
              Working days
            </span>
            <div className="ob__weekdays" role="group" aria-labelledby="ob-workdays-label">
              {WEEKDAYS.map((day) => {
                const on = workdays.includes(day.value)
                return (
                  <button
                    key={day.value}
                    type="button"
                    className="ob__weekday"
                    aria-pressed={on}
                    aria-label={day.full}
                    onClick={() => toggleWorkday(day.value)}
                  >
                    {on && <CheckGlyph />}
                    {day.short}
                  </button>
                )
              })}
            </div>
            <p className="ob__hint">
              {workdays.length === 0
                ? 'Pick at least one day, or pace has nothing to measure against.'
                : `${workdays.length} day${workdays.length === 1 ? '' : 's'} a week.`}
            </p>
          </div>

          <Actions
            onBack={back}
            submit
            primaryLabel="Continue"
            disabled={workdays.length === 0}
            secondary={
              <Button variant="ghost" onClick={() => setWorkdays(DEFAULT_WORKDAYS)}>
                Mon to Fri
              </Button>
            }
          />
        </form>
      </Shell>
    )
  }

  /* ------------------------------------------------------ step 5: finish */

  const goalRow = (type: GoalType, label: string) => {
    const entry = enabledGoals[type]
    return (
      <div className="ob__summary-row" key={type}>
        <dt className="ob__summary-term">{label}</dt>
        <dd className={`ob__summary-value${entry ? ' num' : ' ob__summary-value--off'}`}>
          {entry ? formatCurrency(entry.amount, settings) : 'Not set'}
        </dd>
      </div>
    )
  }

  const workdayLabel =
    workdays.length === 7
      ? 'Every day'
      : workdays.length === 0
        ? 'None selected'
        : WEEKDAYS.filter((d) => workdays.includes(d.value))
            .map((d) => d.short)
            .join(', ')

  return (
    <Shell step={5}>
      <div className="ob__body">
        <div>
          <h1 className="ob__title">
            You&rsquo;re set{trimmedName === '' ? '' : `, ${trimmedName}`}.
          </h1>
          <p className="ob__lede">Here is what the tracker will measure. Change any of it later.</p>
          {resumed && (
            <p className="ob__lede" role="status">
              Nothing was stored last time, so your answers are still here. Try Start Tracking
              again.
            </p>
          )}
        </div>

        <dl className="ob__summary">
          {goalRow('daily', 'Daily goal')}
          {goalRow('monthly', 'Monthly goal')}
          {goalRow('annual', 'Annual goal')}
          <div className="ob__summary-row">
            <dt className="ob__summary-term">Commission</dt>
            {/* savedRate is the figure the payload carries, so this line states
                what will be stored rather than what was typed. */}
            <dd className={`ob__summary-value${savedRate === null ? ' ob__summary-value--off' : ''}`}>
              {savedRate === null ? 'Not tracked' : `${formatBasisPoints(savedRate, settings)} default`}
            </dd>
          </div>
          <div className="ob__summary-row">
            <dt className="ob__summary-term">Working days</dt>
            <dd className="ob__summary-value">{workdayLabel}</dd>
          </div>
        </dl>

        <p className="ob__note">Everything above is stored on this device.</p>
      </div>

      <div className="ob__actions">
        <Button variant="primary" size="lg" block onClick={finish}>
          Start Tracking
        </Button>
        <Button variant="ghost" block onClick={back}>
          Back
        </Button>
      </div>
    </Shell>
  )
}

export default OnboardingFlow

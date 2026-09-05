/**
 * Settings > Work Schedule (§8 step 4, §66-68).
 *
 * These two lists are the denominator of almost every number in the app: pace,
 * "required per workday", and the goal streak all count configured working
 * days rather than calendar days. The screen says that once, in one line, at
 * the top — and then gets out of the way.
 */
import { useMemo, useState } from 'react'
import { Button, Card, Chip, SegmentedControl, useToast } from '@/components'
import { useActions, useSettings } from '@/app/store'
import { compareIso, isValidIso, todayIso, weekdayOf } from '@/core/date'
import { formatDate } from '@/core/format'
import type { IsoDate, Weekday } from '@/core/types'
import { CrossIcon, Note, SettingsPage, TextField } from './parts'

const DAY_NAMES: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** SegmentedControl keys off strings; `Weekday` is a number. */
type WeekdayValue = '0' | '1' | '2' | '3' | '4' | '5' | '6'

/** "Mon–Fri" where the selection is contiguous, otherwise a plain list. */
export function describeWorkdays(workdays: readonly Weekday[]): string {
  if (workdays.length === 0) return 'No working days set'
  if (workdays.length === 7) return 'Every day'
  const sorted = [...workdays].sort((a, b) => a - b)
  const contiguous = sorted.every((d, i) => i === 0 || d === (sorted[i - 1] ?? d) + 1)
  const short = (d: Weekday) => DAY_NAMES[d].slice(0, 3)
  if (contiguous && sorted.length > 2) {
    return `${short(sorted[0] as Weekday)}–${short(sorted[sorted.length - 1] as Weekday)}`
  }
  return sorted.map((d) => short(d as Weekday)).join(', ')
}

export default function ScheduleSettings() {
  const settings = useSettings()
  const { saveSettings } = useActions()
  const { success, error: errorToast } = useToast()
  const today = todayIso()

  const [newDate, setNewDate] = useState('')
  const [dateError, setDateError] = useState<string | null>(null)

  // Days are ordered from the configured first day of the week, so the row
  // reads the way the user's own calendar does.
  const orderedDays = useMemo(() => {
    const start = settings.weekStartsOn
    return ALL_DAYS.map((_, i) => ((start + i) % 7) as Weekday)
  }, [settings.weekStartsOn])

  const excluded = useMemo(
    () => [...settings.excludedDates].sort(compareIso),
    [settings.excludedDates],
  )

  function toggleDay(day: Weekday) {
    const has = settings.workdays.includes(day)
    if (has && settings.workdays.length === 1) {
      errorToast('Keep at least one working day', {
        detail: 'Pace and streaks are measured against working days.',
        key: 'workdays',
      })
      return
    }
    const next = has
      ? settings.workdays.filter((d) => d !== day)
      : [...settings.workdays, day].sort((a, b) => a - b)
    saveSettings({ workdays: next })
  }

  function addExcluded() {
    const value = newDate.trim()
    if (!isValidIso(value)) {
      setDateError('Pick a date to exclude.')
      return
    }
    if (settings.excludedDates.includes(value)) {
      setDateError('That date is already excluded.')
      return
    }
    setDateError(null)
    setNewDate('')
    saveSettings({ excludedDates: [...settings.excludedDates, value].sort(compareIso) })
    success(`${formatDate(value, settings, 'long')} excluded`, {
      detail:
        value < today
          ? 'It no longer counts as a working day — including in the figures for days already finished.'
          : 'It no longer counts as a working day.',
      key: 'excluded',
    })
  }

  function removeExcluded(date: IsoDate) {
    saveSettings({ excludedDates: settings.excludedDates.filter((d) => d !== date) })
    success(`${formatDate(date, settings, 'medium')} counts again`, { key: 'excluded' })
  }

  return (
    <SettingsPage
      title="Work Schedule"
      subtitle={describeWorkdays(settings.workdays)}
      storedLocally
    >
      <Card title="Working days">
        <div className="shell-stack">
          <Note>
            Pace, the required-per-workday figure and your goal streak all count these days — not
            calendar days. A Saturday you never work should not read as a day you missed.
          </Note>

          {/*
            §69 candour. Goals and commission rates are versioned, so changing
            one leaves the past alone and the copy on those screens says so. The
            work schedule is NOT versioned — there is one current list, and every
            past day is re-measured against it — so this screen has to say that
            instead of borrowing the prospective promise it cannot keep.
          */}
          <Note>
            <strong>A change here also changes how past days are measured.</strong> Unlike a goal or
            a commission rate, SalesTrack keeps one working-day list rather than a history of them.
            Adding Saturday re-judges the Saturdays you have already worked, and your goal streak,
            pace and required-per-workday figures for earlier days are recalculated against the new
            list.
          </Note>

          <div className="set-daygrid" role="group" aria-label="Working days">
            {orderedDays.map((day) => (
              <Chip
                key={day}
                selected={settings.workdays.includes(day)}
                onClick={() => toggleDay(day)}
                ariaLabel={`${DAY_NAMES[day]}${settings.workdays.includes(day) ? ' is a working day' : ' is not a working day'}`}
              >
                {DAY_NAMES[day].slice(0, 3)}
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      {/*
        All seven days, not just Sunday and Monday.
        `Settings.weekStartsOn` is a `Weekday` (0-6) and the rest of the app —
        the day grid above, the ledger calendar — honours whatever it holds. A
        restored backup carrying 3 used to leave this control reading "Sunday"
        over a week that ran Wed-Tue, with the Sunday option already looking
        selected so tapping it did nothing. The control now shows the value the
        app is actually using.
      */}
      <Card title="Week starts on">
        <div className="shell-stack">
          <SegmentedControl<WeekdayValue>
            label="First day of the week"
            className="set-weekstart"
            value={String(settings.weekStartsOn) as WeekdayValue}
            onChange={(v) => saveSettings({ weekStartsOn: Number(v) as Weekday })}
            options={ALL_DAYS.map((day) => ({
              value: String(day) as WeekdayValue,
              label: DAY_NAMES[day].slice(0, 3),
              ariaLabel: DAY_NAMES[day],
            }))}
          />
          <Note quiet>
            Sets how the calendar in the Sales ledger is laid out, and where the day row above
            starts.
          </Note>
        </div>
      </Card>

      <Card title="Excluded dates">
        <div className="shell-stack">
          <Note>
            Holidays, vacation, anything else you will not be selling. An excluded date stops
            counting as a working day even when it falls on one.
          </Note>
          <Note>
            <strong>Excluding a date that has already passed changes how that stretch reads.</strong>{' '}
            It is removed from the working days counted so far, which moves the expected-so-far and
            required-per-workday figures for days you have already finished. Excluding a future date
            only affects what is still ahead.
          </Note>

          <div className="set-inline-add">
            <TextField
              required
              label="Add a date"
              type="date"
              value={newDate}
              onChange={(v) => {
                setNewDate(v)
                setDateError(null)
              }}
              onEnter={addExcluded}
              error={dateError}
            />
            <Button variant="secondary" onClick={addExcluded}>
              Add date
            </Button>
          </div>

          {excluded.length === 0 ? (
            <Note quiet>No dates are excluded. Every configured working day counts.</Note>
          ) : (
            <div className="set-datelist">
              {excluded.map((date) => (
                <span key={date} className="set-datechip">
                  <span>
                    {formatDate(date, settings, 'medium')}
                    {!settings.workdays.includes(weekdayOf(date)) && (
                      <span className="sr-only"> (already not a working day)</span>
                    )}
                    {date < today && <span className="sr-only"> (in the past)</span>}
                  </span>
                  <button
                    type="button"
                    className="set-datechip__remove focus-inset"
                    onClick={() => removeExcluded(date)}
                    aria-label={`Stop excluding ${formatDate(date, settings, 'long')}`}
                  >
                    <CrossIcon />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>
    </SettingsPage>
  )
}

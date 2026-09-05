/**
 * Monthly calendar — §22.
 *
 * A real calendar grid, weeks starting on `settings.weekStartsOn`, each cell
 * carrying that day's net total. Strong days are marked three ways at once
 * (glyph, filled bar, screen-reader wording) so colour is never the only signal
 * (§63). Non-working days are drawn quieter — an outline instead of a fill —
 * because a day off is not a miss.
 *
 * Every number here comes from `monthCalendar` and `goalAmountFor`; the only
 * arithmetic is `percentOf`, which is the calc engine's own fraction helper.
 *
 * The cells show whatever the ledger filters kept, because the calendar picks
 * the day for the list underneath it. The goal mark does not: it is read from
 * a second `monthCalendar` over the unfiltered ledger, so a day that genuinely
 * hit its daily goal keeps its star even while you browse a slice of it. When
 * the two can differ, the caption and the spoken label say which is which.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { monthCalendar, goalAmountFor } from '@/core/calc'
import {
  addDays,
  formatWeekdayLabel,
  isWorkday,
  isoParts,
  startOfMonth,
  startOfWeek,
  todayIso,
  weekdayOf,
} from '@/core/date'
import { percentOf } from '@/core/money'
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/core/format'
import type { Goal, IsoDate, Sale, Settings } from '@/core/types'
import { peak } from './scale'

const StrongIcon = () => (
  <svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
    <path d="M5 0.4 6.4 3.5 9.6 3.9 7.2 6.1 7.9 9.4 5 7.8 2.1 9.4 2.8 6.1 0.4 3.9 3.6 3.5Z" />
  </svg>
)

export interface MonthCalendarProps {
  /** Any date inside the month to draw. */
  month: IsoDate
  /** Filtered — what the cells show. */
  sales: readonly Sale[]
  /** Unfiltered — what the daily-goal mark is judged against. */
  allSales: readonly Sale[]
  goals: readonly Goal[]
  settings: Settings
  selected: IsoDate
  /** True when `sales` is a filtered slice of `allSales`. */
  filtersActive?: boolean
  onSelect: (date: IsoDate) => void
}

export function MonthCalendar({
  month,
  sales,
  allSales,
  goals,
  settings,
  selected,
  filtersActive = false,
  onSelect,
}: MonthCalendarProps) {
  const today = todayIso()
  const gridRef = useRef<HTMLDivElement>(null)

  const days = useMemo(() => monthCalendar(sales, month), [sales, month])
  const ceiling = useMemo(() => peak(days.map((day) => day.netSales)), [days])

  // Net per day across the whole ledger — the only figure the goal mark reads.
  // Without filters it is the same walk, so the second pass is skipped.
  const goalNetByDay = useMemo(() => {
    const source = filtersActive ? monthCalendar(allSales, month) : days
    return new Map(source.map((day) => [day.date, day.netSales]))
  }, [filtersActive, allSales, month, days])

  const first = startOfMonth(month)
  const leading = (weekdayOf(first) - settings.weekStartsOn + 7) % 7

  /* Roving tabindex + arrow keys (ARIA APG grid pattern). Without this a
     keyboard user pays up to 31 Tab presses to cross a month, and there is no
     way to move by week at all. Arrows move focus only; Enter/Space on the
     native button still does the selecting, so the day view below does not
     churn on every keystroke. */
  const [focusDate, setFocusDate] = useState<IsoDate | null>(null)
  const has = (date: IsoDate | null) => date != null && days.some((d) => d.date === date)
  // Exactly one cell is ever tabbable. Every candidate is checked against the
  // month actually on screen, so paging to another month can never leave the
  // grid with no tab stop at all.
  const tabStop =
    (has(focusDate) ? focusDate : null) ??
    (has(selected) ? selected : null) ??
    (has(today) ? today : null) ??
    days[0]?.date ??
    null

  const focusDay = (date: IsoDate) => {
    if (!days.some((d) => d.date === date)) return
    setFocusDate(date)
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-cal-date="${date}"]`)
      ?.focus()
  }

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = (event.target as HTMLElement).dataset?.calDate as IsoDate | undefined
    if (!current) return
    const index = days.findIndex((d) => d.date === current)
    if (index === -1) return

    const step = (delta: number) => {
      const next = days[Math.min(days.length - 1, Math.max(0, index + delta))]
      if (next) {
        event.preventDefault()
        focusDay(next.date)
      }
    }

    switch (event.key) {
      case 'ArrowRight': step(1); break
      case 'ArrowLeft': step(-1); break
      case 'ArrowDown': step(7); break
      case 'ArrowUp': step(-7); break
      case 'Home': step(-index); break
      case 'End': step(days.length - 1 - index); break
      default: break
    }
  }

  const weekdayNames = useMemo(() => {
    const anchor = startOfWeek(first, settings.weekStartsOn)
    return Array.from({ length: 7 }, (_, i) =>
      formatWeekdayLabel(addDays(anchor, i), settings.locale).slice(0, 3),
    )
  }, [first, settings.weekStartsOn, settings.locale])

  return (
    <div className="cal">
      <div className="cal__weekdays" aria-hidden="true">
        {weekdayNames.map((name, i) => (
          <span className="cal__weekday" key={i}>
            {name}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        className="cal__grid"
        role="group"
        aria-label={`${formatDate(first, settings, 'monthYear')} sales by day. Use the arrow keys to move between days.`}
        onKeyDown={onGridKeyDown}
      >
        {Array.from({ length: leading }, (_, i) => (
          <span className="cal__blank" key={`blank-${i}`} aria-hidden="true" />
        ))}

        {days.map((day) => {
          const working = isWorkday(day.date, settings.workdays, settings.excludedDates)
          const dailyGoal = goalAmountFor('daily', day.date, goals)
          const goalNet = goalNetByDay.get(day.date) ?? day.netSales
          const strong = dailyGoal !== null && dailyGoal > 0 && goalNet >= dailyGoal
          const fill = percentOf(day.netSales, ceiling)
          const isSelected = day.date === selected
          const isToday = day.date === today

          const classes = [
            'cal__day',
            working ? '' : 'cal__day--off',
            day.saleCount === 0 && day.netSales === 0 ? 'cal__day--empty' : '',
            isToday && !isSelected ? 'cal__day--today' : '',
            isSelected ? 'cal__day--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const parts = [
            formatDate(day.date, settings, 'long'),
            day.netSales === 0 && day.saleCount === 0
              ? filtersActive
                ? 'nothing matching your filters'
                : 'no sales'
              : `${formatCurrency(day.netSales, settings)}, ${day.saleCount} ${day.saleCount === 1 ? 'sale' : 'sales'}${
                  filtersActive ? ' matching your filters' : ''
                }`,
            strong
              ? filtersActive && goalNet !== day.netSales
                ? `met the daily goal with ${formatCurrency(goalNet, settings)} across every sale that day`
                : 'met the daily goal'
              : '',
            working ? '' : 'not a working day',
            isToday ? 'today' : '',
          ].filter(Boolean)

          return (
            <button
              type="button"
              key={day.date}
              data-cal-date={day.date}
              className={classes}
              onClick={() => {
                setFocusDate(day.date)
                onSelect(day.date)
              }}
              tabIndex={day.date === tabStop ? 0 : -1}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={parts.join(', ')}
            >
              <span className="cal__daynum" aria-hidden="true">
                {isoParts(day.date).day}
              </span>
              <span className="cal__amount" aria-hidden="true">
                {day.netSales === 0 ? '' : formatCurrencyCompact(day.netSales, settings)}
              </span>
              {strong ? (
                <span className="cal__strong" aria-hidden="true">
                  <StrongIcon />
                </span>
              ) : null}
              {day.netSales > 0 ? (
                <span className="cal__bar" aria-hidden="true">
                  <span
                    className="cal__bar-fill"
                    style={{ width: `${Math.max(8, Math.round(fill * 100))}%` }}
                  />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <p className="cal__legend">
        <span className="cal__legend-item">
          <StrongIcon /> Met the daily goal
        </span>
        <span className="cal__legend-item">
          <span className="cal__legend-swatch" aria-hidden="true" /> Non-working day
        </span>
      </p>

      {filtersActive && (
        <p className="cal__note">
          Amounts match your filters. The goal mark counts every sale that day.
        </p>
      )}
    </div>
  )
}

export default MonthCalendar

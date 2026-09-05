/**
 * Annual progress chart — §25.
 *
 * Hand-rolled SVG, no chart library. One bar per month from `monthlySeries`,
 * which zero-fills, so a quiet month reads as a gap rather than disappearing.
 * Drawn in a fixed viewBox and scaled by CSS, which is what keeps it legible at
 * 360px. Every colour is a --chart-* token, so it follows the theme.
 *
 * Accessibility (§63): an .sr-only sentence carries every month and figure in
 * reading order, and each column has a focusable hit area with role="button",
 * so the chart is both readable and operable without sight of it.
 */
import { useMemo } from 'react'
import { formatCurrency, formatCurrencyCompact, formatMonthKey } from '@/core/format'
import type { FormatSettings } from '@/core/format'
import { percentOf } from '@/core/money'
import type { SeriesPoint } from '@/core/calc'
import { peak } from './scale'

const VIEW_W = 320
const VIEW_H = 168
const PAD_LEFT = 32
const PAD_RIGHT = 4
const PAD_TOP = 16
const PAD_BOTTOM = 20
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM
const BAR_INSET = 4

export interface AnnualChartProps {
  series: SeriesPoint[]
  settings: FormatSettings
  /** 'YYYY-MM' of the month currently in focus, if any. */
  activeKey?: string
  /** Tap a bar to jump to that month. */
  onSelectMonth: (key: string) => void
  year: number
}

export function AnnualChart({
  series,
  settings,
  activeKey,
  onSelectMonth,
  year,
}: AnnualChartProps) {
  const ceiling = useMemo(() => peak(series.map((p) => p.netSales)), [series])
  const bestKey = useMemo(() => {
    let best: SeriesPoint | null = null
    for (const point of series) {
      if (point.netSales > 0 && (best === null || point.netSales > best.netSales)) best = point
    }
    return best?.key ?? null
  }, [series])

  const columnWidth = PLOT_W / series.length
  const barWidth = Math.max(6, columnWidth - BAR_INSET * 2)
  const baseline = PAD_TOP + PLOT_H

  // Three reference lines: 0, half, full. Labelled in compact currency.
  const gridStops = [0, 0.5, 1]

  const summary = series
    .map((point) => `${point.label}: ${formatCurrency(point.netSales, settings)}`)
    .join('. ')

  return (
    <div className="chart">
      <p className="sr-only">
        {`Net sales by month for ${year}. ${summary}.`}
        {bestKey ? ` Strongest month: ${formatMonthKey(bestKey, settings, 'monthYearShort')}.` : ''}
      </p>

      <svg
        className="chart__svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={`Net sales by month for ${year}. Select a bar to open that month.`}
      >
        {gridStops.map((stop) => {
          const y = baseline - stop * PLOT_H
          return (
            <g key={stop}>
              <line
                className={stop === 0 ? 'chart__axis-line' : 'chart__grid-line'}
                x1={PAD_LEFT}
                x2={VIEW_W - PAD_RIGHT}
                y1={y}
                y2={y}
              />
              <text aria-hidden="true" className="chart__axis-label" x={PAD_LEFT - 5} y={y + 3} textAnchor="end">
                {ceiling === 0 && stop > 0 ? '' : formatCurrencyCompact(Math.round(ceiling * stop), settings)}
              </text>
            </g>
          )
        })}

        {series.map((point, index) => {
          const fraction = percentOf(point.netSales, ceiling)
          const height = point.netSales === 0 ? 2 : Math.max(3, fraction * PLOT_H)
          const x = PAD_LEFT + index * columnWidth + (columnWidth - barWidth) / 2
          const y = baseline - height
          const active = point.key === activeKey
          const best = point.key === bestKey && !active

          return (
            <g
              key={point.key}
              className={`chart__col${active ? ' chart__col--active' : ''}`}
            >
              <rect
                className={`chart__bar${point.netSales === 0 ? ' chart__bar--empty' : ''}${
                  best ? ' chart__bar--best' : ''
                }`}
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={2}
              />
              <text
                aria-hidden="true"
                className="chart__month-label"
                x={x + barWidth / 2}
                y={VIEW_H - 7}
                textAnchor="middle"
              >
                {point.label}
              </text>
              {active && point.netSales > 0 ? (
                <text
                  aria-hidden="true"
                  className="chart__value-label"
                  x={x + barWidth / 2}
                  y={Math.max(9, y - 4)}
                  textAnchor="middle"
                >
                  {formatCurrencyCompact(point.netSales, settings)}
                </text>
              ) : null}
              <rect
                className="chart__hit"
                x={PAD_LEFT + index * columnWidth}
                y={PAD_TOP}
                width={columnWidth}
                height={PLOT_H + PAD_BOTTOM - 4}
                role="button"
                tabIndex={0}
                aria-label={`${formatMonthKey(point.key, settings)}, ${formatCurrency(
                  point.netSales,
                  settings,
                )} net sales. Open this month.`}
                onClick={() => onSelectMonth(point.key)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectMonth(point.key)
                  }
                }}
              />
            </g>
          )
        })}
      </svg>

      <p className="chart__caption">
        {bestKey
          ? `Strongest month: ${formatMonthKey(bestKey, settings, 'monthYearShort')}. Select a bar to open that month.`
          : 'Months fill in as sales are recorded.'}
      </p>
    </div>
  )
}

export default AnnualChart

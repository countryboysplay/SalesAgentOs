/**
 * TrendChart — the §28 sales trend, hand-rolled SVG.
 *
 * Design decisions worth knowing before you change anything:
 *
 * - **The baseline is always zero.** The series is zero-filled by
 *   `src/core/calc/trends.ts`, so a quiet day is a real 0. Cropping the axis
 *   would turn a flat fortnight into a mountain range.
 * - **One series, one hue.** `--chart-series-1` carries the data; the goal
 *   reference is a *dashed* line in axis ink, so it is told apart by shape and
 *   by its own legend entry, never by colour alone (§63).
 * - **The readout is a fixed row above the plot, not a floating tooltip.** At
 *   360px a tooltip either overflows the card or covers the line, and §58 bans
 *   hover-dependent controls — so pointer, touch and keyboard all drive the
 *   same always-visible row.
 * - **Geometry is measured, not stretched.** The SVG is drawn at real pixel
 *   size via ResizeObserver rather than scaled with preserveAspectRatio, which
 *   would smear the stroke widths and the type. The maths itself lives in
 *   `geometry.ts`, so the 0/1/2-point cases can be tested directly.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import type { Cents } from '@/core/types'
import { PAD_BOTTOM, PAD_TOP, chartGeometry, clamp, indexAtX } from './geometry'
import './TrendChart.css'

export interface TrendChartPoint {
  key: string
  /** Terse axis label, e.g. 'Sep 4'. */
  label: string
  /** Spoken/readout label, e.g. 'Sep 4' or 'Week of Sep 1'. */
  description: string
  /** The plotted value: cents when the money toggle is on, else a count. */
  value: number
  netSales: Cents
  saleCount: number
  /** Goal in force for this bucket, or null. */
  goal: Cents | null
}

export interface TrendChartProps {
  points: TrendChartPoint[]
  /** 'Net sales' or 'Number of sales' — names the single series. */
  seriesLabel: string
  formatAxisValue: (value: number) => string
  formatMoney: (cents: Cents) => string
  formatCount: (count: number) => string
  /** 'Daily goal $500', or null when no reference line applies. */
  goalName: string | null
  /** Keep the y-axis on whole numbers (the sale-count toggle). */
  integerScale?: boolean
  /** The `.sr-only` sentence (§63). */
  summary: string
}

function useMeasuredWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const apply = () => setWidth(Math.round(node.getBoundingClientRect().width))
    apply()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', apply)
      return () => window.removeEventListener('resize', apply)
    }
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

export function TrendChart({
  points,
  seriesLabel,
  formatAxisValue,
  formatMoney,
  formatCount,
  goalName,
  integerScale = false,
  summary,
}: TrendChartProps) {
  const gradientId = useId()
  const hintId = useId()
  const [wrapRef, width] = useMeasuredWidth()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [fromKeyboard, setFromKeyboard] = useState(false)

  const count = points.length

  // A range or metric change swaps the whole series; a stale cursor would point
  // at a bucket that no longer exists.
  useEffect(() => {
    setActive(null)
    setFromKeyboard(false)
  }, [count, seriesLabel])

  const height = clamp(Math.round(width * 0.44), 156, 220)

  const geometry = useMemo(
    () =>
      chartGeometry({
        values: points.map((point) => point.value),
        goals: points.map((point) => (goalName ? point.goal : null)),
        width,
        height,
        integerScale,
        formatAxisValue,
      }),
    // formatAxisValue is rebuilt each render but is pure in `integerScale`.
    [points, goalName, width, height, integerScale, formatAxisValue],
  )

  const { padLeft, innerW, innerH, xs, ys, axisValues, axisLabels } = geometry
  const yOfValue = (value: number): number =>
    PAD_TOP + innerH - (clamp(value, 0, geometry.top) / geometry.top) * innerH

  const moveCursor = (clientX: number) => {
    const node = svgRef.current
    if (!node) return
    // No preventDefault: a vertical swipe must still scroll the screen.
    setActive(indexAtX(clientX, node.getBoundingClientRect(), geometry, count, width))
    setFromKeyboard(false)
  }

  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (count === 0) return
    const current = active ?? count - 1
    let next: number
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = clamp(current - 1, 0, count - 1)
        break
      case 'ArrowRight':
      case 'ArrowUp':
        next = clamp(current + 1, 0, count - 1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = count - 1
        break
      case 'Escape':
        setActive(null)
        setFromKeyboard(false)
        return
      default:
        return
    }
    event.preventDefault()
    setActive(next)
    setFromKeyboard(true)
  }

  // Short name on the SVG itself: the full summary is the figcaption, and
  // repeating it on every focus would read the whole paragraph again.
  const chartName = `${seriesLabel} line chart, ${count} ${count === 1 ? 'point' : 'points'}`

  const readoutIndex = active ?? (count > 0 ? count - 1 : 0)
  const readout = points[readoutIndex]
  const readoutText = readout
    ? `${readout.description}. ${formatMoney(readout.netSales)}, ${formatCount(readout.saleCount)}.`
    : ''

  return (
    <figure className="trend" role="group" aria-label={`${seriesLabel} trend chart`}>
      <figcaption className="sr-only">{summary}</figcaption>
      <p className="sr-only" id={hintId}>
        Interactive chart. Press the left and right arrow keys to read each point, Home or End for
        the ends, Escape to clear.
      </p>

      {/* Fixed-height readout: the value surface for touch, pointer and keyboard
          alike. aria-hidden because the live region below speaks it instead. */}
      <div className="trend__readout" aria-hidden="true">
        {readout ? (
          <>
            <span className="trend__readout-when">{readout.description}</span>
            <span className="trend__readout-value num">{formatMoney(readout.netSales)}</span>
            <span className="trend__readout-count">{formatCount(readout.saleCount)}</span>
          </>
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {fromKeyboard ? readoutText : ''}
      </p>

      <div className="trend__plot" ref={wrapRef}>
        {width > 0 && count > 0 && (
          <svg
            ref={svgRef}
            className="trend__svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={chartName}
            aria-describedby={hintId}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onBlur={() => setFromKeyboard(false)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-series-1)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--chart-series-1)" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Three gridlines only. More is clutter at this size. */}
            {axisValues.map((value, index) => (
              <line
                key={`grid-${index}`}
                className={index === 2 ? 'trend__axis' : 'trend__grid'}
                x1={padLeft}
                x2={padLeft + innerW}
                y1={yOfValue(value)}
                y2={yOfValue(value)}
              />
            ))}

            {axisValues.map((value, index) => (
              <text
                key={`ylabel-${index}`}
                className="trend__tick"
                x={padLeft - 8}
                y={yOfValue(value) + (index === 0 ? 4 : index === 1 ? 3 : 0)}
                textAnchor="end"
                fontSize={11}
              >
                {axisLabels[index]}
              </text>
            ))}

            {geometry.areaPath && (
              <path className="trend__area" d={geometry.areaPath} fill={`url(#${gradientId})`} />
            )}

            {geometry.goalPath && <path className="trend__goal" d={geometry.goalPath} />}

            {geometry.linePath && (
              <path className="trend__line" d={geometry.linePath} pathLength={1} />
            )}

            {geometry.showMarkers &&
              points.map((point, index) => (
                <circle
                  key={`dot-${point.key}`}
                  className="trend__dot"
                  cx={xs[index]}
                  cy={ys[index]}
                  r={count === 1 ? 5 : 3.5}
                />
              ))}

            {active !== null && points[active] && (
              <g className="trend__cursor">
                <line
                  className="trend__cursor-line"
                  x1={xs[active]}
                  x2={xs[active]}
                  y1={PAD_TOP}
                  y2={PAD_TOP + innerH}
                />
                <circle className="trend__cursor-dot" cx={xs[active]} cy={ys[active]} r={5.5} />
              </g>
            )}

            {geometry.labelIndices.map((index, slot) => (
              <text
                key={`xlabel-${points[index].key}`}
                className="trend__tick"
                x={xs[index]}
                y={height - 6}
                textAnchor={
                  count === 1
                    ? 'middle'
                    : slot === 0
                      ? 'start'
                      : slot === geometry.labelIndices.length - 1
                        ? 'end'
                        : 'middle'
                }
                fontSize={11}
              >
                {points[index].label}
              </text>
            ))}

            <rect
              className="trend__hit"
              x={padLeft - 6}
              y={PAD_TOP}
              width={innerW + 12}
              height={innerH + PAD_BOTTOM}
              onPointerDown={(event) => moveCursor(event.clientX)}
              onPointerMove={(event) => {
                // A mouse hovers; a finger has to stay down to scrub.
                if (event.pointerType !== 'mouse' && event.buttons === 0) return
                moveCursor(event.clientX)
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') setActive(null)
              }}
            />
          </svg>
        )}
      </div>

      <p className="trend__legend">
        <span className="trend__legend-item">
          <span className="trend__swatch trend__swatch--series" aria-hidden="true" />
          {seriesLabel}
        </span>
        {goalName && (
          <span className="trend__legend-item">
            <span className="trend__swatch trend__swatch--goal" aria-hidden="true" />
            {goalName}
          </span>
        )}
        {count === 1 && (
          <span className="trend__legend-note">
            One point so far — the line joins up from the next one.
          </span>
        )}
      </p>
    </figure>
  )
}

export default TrendChart

/**
 * Chart geometry for the §28 trend line — pure pixel maths, no React.
 *
 * It lives apart from the component for two reasons: the thin-data cases
 * (0, 1 and 2 points) are the ones most likely to draw something broken, and a
 * pure function can be tested for them directly. Nothing here touches money as
 * money — cents and counts arrive as plain numbers and leave as coordinates.
 */

/** Rounded axis ceilings. Money can land on 2.5; a count of sales cannot. */
const MONEY_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]
/** Even steps only, so the mid gridline of a count axis is a whole number. */
const COUNT_STEPS = [2, 4, 10]

export const PAD_TOP = 14
export const PAD_RIGHT = 10
export const PAD_BOTTOM = 22
/** Past this many points the markers merge into a caterpillar; the line speaks. */
export const MAX_MARKERS = 14

export function niceCeiling(value: number, integer: boolean): number {
  const steps = integer ? COUNT_STEPS : MONEY_STEPS
  const floor = integer ? 2 : 100 // 2 sales, or $1.00 — never a zero-height axis
  if (!Number.isFinite(value) || value <= 0) return floor
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalised = value / magnitude
  const step = steps.find((candidate) => normalised <= candidate + 1e-9) ?? 10
  return Math.max(floor, Math.round(step * magnitude))
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export interface GeometryInput {
  /** Plotted value per point: cents, or a sale count. */
  values: readonly number[]
  /** Goal in force per point, aligned to `values`. null where none applies. */
  goals: readonly (number | null)[]
  width: number
  height: number
  integerScale: boolean
  /** Used to size the left gutter from the real label text. */
  formatAxisValue: (value: number) => string
}

export interface ChartGeometry {
  top: number
  /** The three gridline values, top first. */
  axisValues: [number, number, number]
  axisLabels: [string, string, string]
  padLeft: number
  innerW: number
  innerH: number
  xs: number[]
  ys: number[]
  /** Empty when there are fewer than two points — a single dot is not a line. */
  linePath: string
  areaPath: string
  /** Stepped dashed reference. Empty when no goal applies anywhere. */
  goalPath: string
  /** Indices whose x-axis label is drawn; always includes the first and last. */
  labelIndices: number[]
  showMarkers: boolean
}

/**
 * The y-domain always starts at zero.
 *
 * The series is zero-filled upstream, so a quiet day is a true 0 — cropping the
 * baseline would turn a flat week into a mountain range. The goal is folded into
 * the domain as well, because a reference line drawn off the top of the plot is
 * worse than no reference line at all.
 */
export function chartGeometry(input: GeometryInput): ChartGeometry {
  const { values, goals, width, height, integerScale, formatAxisValue } = input
  const count = values.length

  let peak = 0
  for (const value of values) if (value > peak) peak = value
  for (const goal of goals) if (goal !== null && goal > peak) peak = goal

  const top = niceCeiling(peak, integerScale)
  const axisValues: [number, number, number] = [top, Math.round(top / 2), 0]
  const axisLabels = axisValues.map(formatAxisValue) as [string, string, string]

  const widest = axisLabels.reduce((longest, label) => Math.max(longest, label.length), 1)
  const padLeft = clamp(10 + widest * 6.6, 34, 74)
  const innerW = Math.max(1, width - padLeft - PAD_RIGHT)
  const innerH = Math.max(1, height - PAD_TOP - PAD_BOTTOM)

  const xOf = (index: number): number =>
    count <= 1 ? padLeft + innerW / 2 : padLeft + (index / (count - 1)) * innerW
  const yOf = (value: number): number => PAD_TOP + innerH - (clamp(value, 0, top) / top) * innerH

  const xs = values.map((_, index) => xOf(index))
  const ys = values.map((value) => yOf(value))

  let linePath = ''
  let areaPath = ''
  if (count > 1) {
    linePath = xs
      .map((x, index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${(ys[index] as number).toFixed(2)}`)
      .join(' ')
    const baseline = yOf(0).toFixed(2)
    areaPath = `${linePath} L${(xs[count - 1] as number).toFixed(2)} ${baseline} L${(xs[0] as number).toFixed(2)} ${baseline} Z`
  }

  // Stepped goal line: one horizontal segment per bucket, joined by a vertical
  // riser wherever the goal in force changed (§69 — history is never rewritten).
  let goalPath = ''
  const half = count <= 1 ? innerW / 2 : innerW / (count - 1) / 2
  let previousY: number | null = null
  goals.forEach((goal, index) => {
    if (goal === null || index >= count) {
      previousY = null
      return
    }
    const y = Number(yOf(goal).toFixed(2))
    const x0 = clamp(xOf(index) - half, padLeft, padLeft + innerW).toFixed(2)
    const x1 = clamp(xOf(index) + half, padLeft, padLeft + innerW).toFixed(2)
    if (previousY === null) goalPath += `M${x0} ${y} `
    else if (previousY !== y) goalPath += `L${x0} ${y} `
    goalPath += `L${x1} ${y} `
    previousY = y
  })

  // Label thinning: at 360px there is room for about four dates, no more.
  const maxLabels = Math.max(2, Math.floor(innerW / 58))
  const labelIndices: number[] = []
  if (count === 1) labelIndices.push(0)
  else if (count > 1) {
    const slots = Math.min(count, maxLabels)
    for (let slot = 0; slot < slots; slot += 1) {
      const index = Math.round((slot * (count - 1)) / Math.max(1, slots - 1))
      if (!labelIndices.includes(index)) labelIndices.push(index)
    }
  }

  return {
    top,
    axisValues,
    axisLabels,
    padLeft,
    innerW,
    innerH,
    xs,
    ys,
    linePath,
    areaPath,
    goalPath: goalPath.trim(),
    labelIndices,
    showMarkers: count <= MAX_MARKERS,
  }
}

/** Nearest point index for a pointer at `clientX` inside a plot of `width`. */
export function indexAtX(
  clientX: number,
  rect: { left: number; width: number },
  geometry: Pick<ChartGeometry, 'padLeft' | 'innerW'>,
  count: number,
  width: number,
): number {
  if (count <= 1 || rect.width === 0) return 0
  const x = ((clientX - rect.left) * width) / rect.width
  const ratio = (x - geometry.padLeft) / geometry.innerW
  return clamp(Math.round(ratio * (count - 1)), 0, count - 1)
}

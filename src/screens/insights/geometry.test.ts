/**
 * Chart geometry specs.
 *
 * These exist for the cases a chart normally gets wrong: a brand-new ledger
 * with nothing in it, one point, two points, a range where every bucket is
 * zero, and a goal line that sits above everything recorded. None of them may
 * produce NaN coordinates, an inverted axis, or a plot the reader can't trust.
 *
 * The reference width is 320px — a 360px phone minus the card padding (§58).
 */
import { describe, expect, it } from 'vitest'
import { PAD_BOTTOM, PAD_TOP, chartGeometry, indexAtX, niceCeiling } from './geometry'

const WIDTH = 320
const HEIGHT = 156
const money = (cents: number) => `$${Math.round(cents / 100)}`
const plain = (value: number) => String(value)

const build = (
  values: number[],
  goals: (number | null)[] = values.map(() => null),
  overrides: Partial<Parameters<typeof chartGeometry>[0]> = {},
) =>
  chartGeometry({
    values,
    goals,
    width: WIDTH,
    height: HEIGHT,
    integerScale: false,
    formatAxisValue: money,
    ...overrides,
  })

const finite = (numbers: readonly number[]) => numbers.every((n) => Number.isFinite(n))

describe('niceCeiling', () => {
  it('never returns zero, so the axis always has height', () => {
    expect(niceCeiling(0, false)).toBe(100)
    expect(niceCeiling(0, true)).toBe(2)
    expect(niceCeiling(-5, false)).toBe(100)
    expect(niceCeiling(Number.NaN, false)).toBe(100)
  })

  it('rounds money up to a readable step', () => {
    expect(niceCeiling(124_000, false)).toBe(150_000)
    expect(niceCeiling(96_000, false)).toBe(100_000)
  })

  it('keeps a sale-count axis on even whole numbers, so the mid gridline is one too', () => {
    for (const peak of [1, 2, 3, 5, 7, 9, 14, 23]) {
      const top = niceCeiling(peak, true)
      expect(top).toBeGreaterThanOrEqual(peak)
      expect(top % 2).toBe(0)
      expect(Number.isInteger(top / 2)).toBe(true)
    }
  })
})

describe('chartGeometry — thin data', () => {
  it('survives an empty series without drawing an empty axis box', () => {
    const geometry = build([])
    expect(geometry.linePath).toBe('')
    expect(geometry.areaPath).toBe('')
    expect(geometry.labelIndices).toEqual([])
    expect(geometry.xs).toEqual([])
    expect(geometry.top).toBeGreaterThan(0)
  })

  it('centres a single point and draws no line, because one point is not a trend', () => {
    const geometry = build([50_000])
    expect(geometry.linePath).toBe('')
    expect(geometry.areaPath).toBe('')
    expect(geometry.xs).toHaveLength(1)
    expect(geometry.xs[0]).toBeCloseTo(geometry.padLeft + geometry.innerW / 2, 5)
    expect(geometry.labelIndices).toEqual([0])
    expect(geometry.showMarkers).toBe(true)
  })

  it('draws two points as a straight line spanning the plot', () => {
    const geometry = build([0, 80_000])
    expect(geometry.linePath.startsWith('M')).toBe(true)
    expect(geometry.linePath.split('L')).toHaveLength(2)
    expect(geometry.xs[0]).toBeCloseTo(geometry.padLeft, 5)
    expect(geometry.xs[1]).toBeCloseTo(geometry.padLeft + geometry.innerW, 5)
    // y grows downwards, so the bigger value sits higher on the screen.
    expect(geometry.ys[1]).toBeLessThan(geometry.ys[0] as number)
    expect(geometry.areaPath.endsWith('Z')).toBe(true)
  })

  it('keeps an all-zero range flat on the baseline instead of dividing by zero', () => {
    const geometry = build([0, 0, 0, 0])
    expect(finite(geometry.ys)).toBe(true)
    const baseline = PAD_TOP + geometry.innerH
    for (const y of geometry.ys) expect(y).toBeCloseTo(baseline, 5)
  })
})

describe('chartGeometry — honest scale', () => {
  it('anchors the baseline at zero, never at the smallest value', () => {
    const geometry = build([90_000, 92_000, 94_000])
    const baseline = PAD_TOP + geometry.innerH
    expect(geometry.axisValues[2]).toBe(0)
    // A 2% spread must read as a 2% spread, not as a mountain range.
    const spread = Math.abs((geometry.ys[0] as number) - (geometry.ys[2] as number))
    expect(spread).toBeLessThan(geometry.innerH * 0.1)
    expect(baseline - (geometry.ys[0] as number)).toBeGreaterThan(geometry.innerH * 0.5)
  })

  it('keeps every point inside the plot box', () => {
    const geometry = build([0, 12_345, 98_765, 4_200])
    for (const y of geometry.ys) {
      expect(y).toBeGreaterThanOrEqual(PAD_TOP - 0.01)
      expect(y).toBeLessThanOrEqual(PAD_TOP + geometry.innerH + 0.01)
    }
    expect(HEIGHT - PAD_BOTTOM).toBeGreaterThan(PAD_TOP)
  })

  it('folds the goal into the domain, so the reference line is never off-screen', () => {
    const withoutGoal = build([10_000, 20_000])
    const withGoal = build([10_000, 20_000], [50_000, 50_000])
    expect(withGoal.top).toBeGreaterThan(withoutGoal.top)
    expect(withGoal.top).toBeGreaterThanOrEqual(50_000)
    expect(withGoal.goalPath).not.toBe('')
    expect(withGoal.goalPath.includes('NaN')).toBe(false)
  })

  it('steps the goal line where the goal changed and breaks where there was none', () => {
    const geometry = build([0, 0, 0], [40_000, 60_000, null])
    // Two horizontal runs and one riser, then nothing for the goal-less bucket.
    expect(geometry.goalPath.startsWith('M')).toBe(true)
    expect((geometry.goalPath.match(/L/g) ?? []).length).toBe(3)
  })

  it('draws no goal path at all when no bucket has one', () => {
    expect(build([1, 2, 3]).goalPath).toBe('')
  })
})

describe('chartGeometry — labels and markers', () => {
  it('thins x labels at phone width but always keeps the first and last', () => {
    const geometry = build(Array.from({ length: 30 }, (_, i) => i * 1000))
    expect(geometry.labelIndices.length).toBeLessThanOrEqual(5)
    expect(geometry.labelIndices[0]).toBe(0)
    expect(geometry.labelIndices[geometry.labelIndices.length - 1]).toBe(29)
    // Strictly increasing, so labels never double back on each other.
    for (let i = 1; i < geometry.labelIndices.length; i += 1) {
      expect(geometry.labelIndices[i]).toBeGreaterThan(geometry.labelIndices[i - 1] as number)
    }
  })

  it('drops the point markers once they would merge into a blob', () => {
    expect(build(Array.from({ length: 14 }, () => 1000)).showMarkers).toBe(true)
    expect(build(Array.from({ length: 15 }, () => 1000)).showMarkers).toBe(false)
  })

  it('widens the left gutter for wider axis labels, within limits', () => {
    const narrow = build([5], [], { formatAxisValue: plain })
    const wide = build([5], [], { formatAxisValue: () => '$1,234,567' })
    expect(wide.padLeft).toBeGreaterThan(narrow.padLeft)
    expect(wide.padLeft).toBeLessThanOrEqual(74)
    expect(narrow.padLeft).toBeGreaterThanOrEqual(34)
  })
})

describe('indexAtX', () => {
  const geometry = build([0, 1, 2, 3, 4])
  const rect = { left: 0, width: WIDTH }

  it('snaps to the nearest point and clamps at both ends', () => {
    expect(indexAtX(geometry.padLeft, rect, geometry, 5, WIDTH)).toBe(0)
    expect(indexAtX(geometry.padLeft + geometry.innerW, rect, geometry, 5, WIDTH)).toBe(4)
    expect(indexAtX(geometry.padLeft + geometry.innerW / 2, rect, geometry, 5, WIDTH)).toBe(2)
    expect(indexAtX(-500, rect, geometry, 5, WIDTH)).toBe(0)
    expect(indexAtX(5000, rect, geometry, 5, WIDTH)).toBe(4)
  })

  it('accounts for a plot rendered at a different CSS size than its pixel width', () => {
    const scaled = { left: 0, width: WIDTH / 2 }
    expect(indexAtX(geometry.padLeft / 2, scaled, geometry, 5, WIDTH)).toBe(0)
    expect(indexAtX((geometry.padLeft + geometry.innerW) / 2, scaled, geometry, 5, WIDTH)).toBe(4)
  })

  it('has nothing to snap to with a single point', () => {
    expect(indexAtX(100, rect, geometry, 1, WIDTH)).toBe(0)
  })
})

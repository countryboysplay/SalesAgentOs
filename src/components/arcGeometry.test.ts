/**
 * ArcGauge geometry — pure math, no DOM. See arcGauge.ts for the "why".
 */
import { describe, expect, it } from 'vitest'
import { arcGaugeGeometry } from './arcGeometry'

describe('arcGaugeGeometry', () => {
  it('derives the circumference from the radius (pi * r), never a hard-coded constant', () => {
    expect(arcGaugeGeometry(55, 0).circumference).toBeCloseTo(Math.PI * 55, 6)
    expect(arcGaugeGeometry(40, 0).circumference).toBeCloseTo(Math.PI * 40, 6)
  })

  it('draws nothing at 0 progress: offset equals the full circumference', () => {
    const { circumference, offset } = arcGaugeGeometry(55, 0)
    expect(offset).toBeCloseTo(circumference, 6)
  })

  it('draws the full sweep at 100% progress: offset is 0', () => {
    expect(arcGaugeGeometry(55, 1).offset).toBeCloseTo(0, 6)
  })

  it('matches the mockup at 78%: ~172.79 circumference, ~38.01 offset', () => {
    const { circumference, offset } = arcGaugeGeometry(55, 0.78)
    expect(circumference).toBeCloseTo(172.7876, 3)
    expect(offset).toBeCloseTo(38.013, 2)
  })

  it('is linear between 0 and 1', () => {
    const { circumference, offset } = arcGaugeGeometry(55, 0.5)
    expect(offset).toBeCloseTo(circumference / 2, 6)
  })

  it('clamps overshoot past 100% to a full sweep, unlike ProgressBar', () => {
    expect(arcGaugeGeometry(55, 1.24).offset).toBeCloseTo(0, 6)
  })

  it('clamps negative progress to an empty sweep', () => {
    expect(arcGaugeGeometry(55, -0.4).offset).toBeCloseTo(Math.PI * 55, 6)
  })

  it('treats non-finite progress as unknown (empty sweep), matching formatPercent (EM_DASH) elsewhere', () => {
    expect(arcGaugeGeometry(55, NaN).offset).toBeCloseTo(Math.PI * 55, 6)
    expect(arcGaugeGeometry(55, Infinity).offset).toBeCloseTo(Math.PI * 55, 6)
  })
})

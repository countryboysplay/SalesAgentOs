/**
 * Virtual-list geometry for the All view.
 *
 * The scenario these specs pin down is the one that was wrong: 20 September
 * sales followed by August, with the pinned month bar chosen from the overscan
 * start rather than from the first row on screen. That put SEPTEMBER 2026 and
 * September's subtotal over August rows for a whole 400px band of scrolling.
 */
import { describe, expect, it } from 'vitest'
import { makeSale } from '@/core/calc/fixtures'
import {
  HEADER_HEIGHT,
  OVERSCAN_PX,
  ROW_HEIGHT,
  flatten,
  indexAt,
  pinnedHeaderIndex,
  visibleRange,
  type SaleGroup,
} from './virtual'

function group(key: string, label: string, total: string, count: number): SaleGroup {
  return {
    key,
    label,
    total,
    sales: Array.from({ length: count }, (_, i) =>
      makeSale({ amount: 10_000, date: `${key}-0${(i % 9) + 1}`, id: `${key}-${i}` }),
    ),
  }
}

const GROUPS = [
  group('2026-09', 'September 2026', '$18,240.00', 20),
  group('2026-08', 'August 2026', '$12,100.00', 20),
]

describe('flatten', () => {
  it('lays out headers and rows at their CSS heights', () => {
    const { items, offsets, headerFor } = flatten(GROUPS)

    expect(items).toHaveLength(42) // 2 headers + 40 rows
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(HEADER_HEIGHT)
    expect(offsets[2]).toBe(HEADER_HEIGHT + ROW_HEIGHT)
    // The August header sits after one header and twenty rows.
    expect(offsets[21]).toBe(HEADER_HEIGHT + 20 * ROW_HEIGHT)
    expect(offsets[offsets.length - 1]).toBe(2 * HEADER_HEIGHT + 40 * ROW_HEIGHT)

    expect(headerFor[0]).toBe(0)
    expect(headerFor[20]).toBe(0) // last September row
    expect(headerFor[21]).toBe(21) // August header
    expect(headerFor[22]).toBe(21) // first August row
  })
})

describe('indexAt', () => {
  it('finds the item at a scroll offset, and clamps at both ends', () => {
    const { offsets } = flatten(GROUPS)
    expect(indexAt(offsets, -500)).toBe(0)
    expect(indexAt(offsets, 0)).toBe(0)
    expect(indexAt(offsets, HEADER_HEIGHT)).toBe(1)
    expect(indexAt(offsets, HEADER_HEIGHT + ROW_HEIGHT - 1)).toBe(1)
    expect(indexAt(offsets, 1_000_000)).toBe(offsets.length - 2)
  })
})

describe('pinnedHeaderIndex', () => {
  const { items, offsets, headerFor } = flatten(GROUPS)
  // The August header's top: one header plus twenty September rows.
  const augustTop = HEADER_HEIGHT + 20 * ROW_HEIGHT // 1318

  it('pins the month of the first row on screen, not the overscanned one', () => {
    // 1318-1717 is the band the bug covered: August rows on screen while the
    // overscan start is still inside September.
    for (const scrolled of [augustTop, augustTop + 100, augustTop + OVERSCAN_PX - 1]) {
      const range = visibleRange(offsets, scrolled, 800, items.length)
      expect(range.start).toBeLessThan(21) // overscan really is still in September
      expect(headerFor[range.start]).toBe(0) // ...which is what used to be pinned
      expect(pinnedHeaderIndex(headerFor, range.firstVisible)).toBe(21)
    }
  })

  it('still pins September while September is the month on screen', () => {
    const range = visibleRange(offsets, augustTop - ROW_HEIGHT, 800, items.length)
    expect(pinnedHeaderIndex(headerFor, range.firstVisible)).toBe(0)
  })

  it('pins the first header before the list has been scrolled at all', () => {
    const range = visibleRange(offsets, -240, 800, items.length)
    expect(range.firstVisible).toBe(0)
    expect(pinnedHeaderIndex(headerFor, range.firstVisible)).toBe(0)
  })

  it('has nothing to pin for an empty list', () => {
    expect(pinnedHeaderIndex([], 0)).toBe(-1)
  })

  it('clamps past the end rather than reading off the table', () => {
    expect(pinnedHeaderIndex(headerFor, 10_000)).toBe(21)
  })
})

describe('visibleRange', () => {
  it('mounts an overscan band on each side of the viewport', () => {
    const { items, offsets } = flatten(GROUPS)
    const range = visibleRange(offsets, 1_000, 800, items.length)

    expect(offsets[range.start]).toBeLessThanOrEqual(1_000 - OVERSCAN_PX)
    expect(offsets[range.firstVisible]).toBeLessThanOrEqual(1_000)
    expect(range.firstVisible).toBeGreaterThan(range.start)
    expect(offsets[range.end - 1]).toBeLessThanOrEqual(1_000 + 800 + OVERSCAN_PX)
    expect(range.end).toBeLessThanOrEqual(items.length)
  })
})

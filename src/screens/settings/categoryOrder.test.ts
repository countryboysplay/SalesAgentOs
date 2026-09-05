/**
 * Category reordering.
 *
 * The regression pinned here: "Move up" was a swap of two `sortOrder` values,
 * which is a no-op as soon as two rows hold the same number — and they do, the
 * moment a category is deleted, because a new one is stored with
 * `sortOrder ?? (count of rows)`.
 */
import { describe, expect, it } from 'vitest'

import { reorderWrites, type Sortable } from './categoryOrder'

/** Apply the writes and re-sort the way the screen does. */
function applied(rows: Sortable[], writes: ReturnType<typeof reorderWrites>): string[] {
  const next = rows.map((row) => {
    const write = writes.find((w) => w.id === row.id)
    return write ? { ...row, sortOrder: write.sortOrder } : row
  })
  return [...next].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id)
}

describe('reorderWrites', () => {
  it('moves a row up when the sort orders are already dense and unique', () => {
    const rows: Sortable[] = [
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
    ]
    expect(applied(rows, reorderWrites(rows, 'c', 'b'))).toEqual(['a', 'c', 'b'])
    expect(applied(rows, reorderWrites(rows, 'a', 'b'))).toEqual(['b', 'a', 'c'])
  })

  /**
   * The reproduction from a fresh install: delete Upsell (leaving Primary
   * Sale = 0 and Other = 2, with a row count of 2), then add "Renewals", which
   * is stored as 2 as well. The old swap wrote 2 and 2.
   */
  it('moves a row that shares its sort order with the neighbour it passes', () => {
    const rows: Sortable[] = [
      { id: 'primary', sortOrder: 0 },
      { id: 'other', sortOrder: 2 },
      { id: 'renewals', sortOrder: 2 },
    ]

    const writes = reorderWrites(rows, 'renewals', 'other')
    expect(writes.length).toBeGreaterThan(0)
    expect(applied(rows, writes)).toEqual(['primary', 'renewals', 'other'])
  })

  it('leaves the sequence dense afterwards, so the next move also works', () => {
    let rows: Sortable[] = [
      { id: 'primary', sortOrder: 0 },
      { id: 'other', sortOrder: 2 },
      { id: 'renewals', sortOrder: 2 },
    ]

    const first = reorderWrites(rows, 'renewals', 'other')
    rows = rows
      .map((row) => {
        const write = first.find((w) => w.id === row.id)
        return write ? { ...row, sortOrder: write.sortOrder } : row
      })
      .sort((a, b) => a.sortOrder - b.sortOrder)

    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2])
    expect(applied(rows, reorderWrites(rows, 'renewals', 'primary'))).toEqual([
      'renewals',
      'primary',
      'other',
    ])
  })

  it('heals a sparse sequence left by deletions', () => {
    const rows: Sortable[] = [
      { id: 'a', sortOrder: 3 },
      { id: 'b', sortOrder: 9 },
      { id: 'c', sortOrder: 40 },
    ]
    const writes = reorderWrites(rows, 'b', 'a')
    expect(applied(rows, writes)).toEqual(['b', 'a', 'c'])
    expect(writes.map((w) => w.sortOrder).sort()).toEqual([0, 1, 2])
  })

  it('writes only the rows whose number actually changes', () => {
    const rows: Sortable[] = [
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
      { id: 'd', sortOrder: 3 },
    ]
    // Only the two that traded places; 'a' and 'd' keep the numbers they have.
    expect(reorderWrites(rows, 'c', 'b')).toEqual([
      { id: 'c', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ])
  })

  it('does nothing for an unknown or identical row', () => {
    const rows: Sortable[] = [
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
    ]
    expect(reorderWrites(rows, 'a', 'a')).toEqual([])
    expect(reorderWrites(rows, 'a', 'ghost')).toEqual([])
    expect(reorderWrites(rows, 'ghost', 'a')).toEqual([])
  })

  it('keeps an inactive row sitting between the two in place', () => {
    // The screen reorders within the ACTIVE list, but sortOrder is global.
    const rows: Sortable[] = [
      { id: 'active-1', sortOrder: 0 },
      { id: 'inactive', sortOrder: 1 },
      { id: 'active-2', sortOrder: 2 },
    ]
    expect(applied(rows, reorderWrites(rows, 'active-2', 'active-1'))).toEqual([
      'active-2',
      'inactive',
      'active-1',
    ])
  })
})

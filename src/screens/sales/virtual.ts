/**
 * Virtual-list geometry for the All view.
 *
 * Pure, and deliberately outside the component: the offset table, the binary
 * search, the rendered window and the choice of pinned month header are the
 * parts that can be silently wrong at 1,700px of scroll, so they are testable
 * without a DOM.
 *
 * Row heights are fixed by CSS (64px rows, 38px headers), which is what makes
 * the offset table exact without measuring anything.
 */
import type { ReactNode } from 'react'
import type { Sale } from '@/core/types'

export const ROW_HEIGHT = 64
export const HEADER_HEIGHT = 38
/** Rows drawn beyond the viewport so a fast flick never shows a blank band. */
export const OVERSCAN_PX = 400

export interface SaleGroup {
  key: string
  label: string
  /** Already formatted — the list never touches cents. */
  total: ReactNode
  sales: Sale[]
}

export type VirtualItem =
  | { kind: 'header'; key: string; label: string; total: ReactNode }
  | { kind: 'sale'; key: string; sale: Sale }

export interface Flattened {
  items: VirtualItem[]
  /** offsets[i] is the top of item i; the last entry is the total height. */
  offsets: number[]
  /** For item i, the index of the header it sits under (-1 before the first). */
  headerFor: number[]
}

export function flatten(groups: readonly SaleGroup[]): Flattened {
  const items: VirtualItem[] = []
  const offsets: number[] = [0]
  const headerFor: number[] = []
  let y = 0
  let currentHeader = -1

  for (const group of groups) {
    currentHeader = items.length
    items.push({ kind: 'header', key: `h:${group.key}`, label: group.label, total: group.total })
    headerFor.push(currentHeader)
    y += HEADER_HEIGHT
    offsets.push(y)
    for (const sale of group.sales) {
      items.push({ kind: 'sale', key: sale.id, sale })
      headerFor.push(currentHeader)
      y += ROW_HEIGHT
      offsets.push(y)
    }
  }

  return { items, offsets, headerFor }
}

/** Largest index whose top offset is <= y. Binary search over a sorted table. */
export function indexAt(offsets: readonly number[], y: number): number {
  let lo = 0
  let hi = offsets.length - 2 // last real item
  if (hi < 0) return 0
  if (y <= 0) return 0
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((offsets[mid] ?? 0) <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

export interface VisibleRange {
  /** First item to mount — one overscan band above the viewport. */
  start: number
  /** One past the last item to mount. */
  end: number
  /**
   * First item the reader can actually see. Distinct from `start` on purpose:
   * `start` is ~400px of deliberately off-screen rows, so using it to choose
   * the pinned header pins the previous month for a whole overscan band of
   * scrolling — and pins its subtotal alongside.
   */
  firstVisible: number
}

export function visibleRange(
  offsets: readonly number[],
  scrolled: number,
  viewportHeight: number,
  itemCount: number,
): VisibleRange {
  return {
    start: indexAt(offsets, scrolled - OVERSCAN_PX),
    end: Math.min(itemCount, indexAt(offsets, scrolled + viewportHeight + OVERSCAN_PX) + 1),
    firstVisible: indexAt(offsets, scrolled),
  }
}

/**
 * The header to pin, given the first item actually on screen.
 *
 * -1 when there is nothing to pin at all.
 */
export function pinnedHeaderIndex(headerFor: readonly number[], firstVisible: number): number {
  if (headerFor.length === 0) return -1
  const clamped = Math.min(Math.max(firstVisible, 0), headerFor.length - 1)
  return headerFor[clamped] ?? -1
}

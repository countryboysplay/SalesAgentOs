/**
 * SaleList — the grouped ledger list, in two flavours.
 *
 * `SaleList`         short lists (a day, a month). Real sticky group headers.
 * `VirtualSaleList`  the All view. The app is specified to hold thousands of
 *                    records, so only the rows inside the viewport are in the
 *                    DOM; everything else is a measured offset. Row heights are
 *                    fixed by CSS (64px rows, 38px headers) which is what makes
 *                    the offset table exact without measuring anything.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatDate } from '@/core/format'
import type { FormatSettings } from '@/core/format'
import { SaleRow } from './SaleRow'
import { categoryNameFor } from './ledger'
import { HEADER_HEIGHT, ROW_HEIGHT, flatten, pinnedHeaderIndex, visibleRange } from './virtual'
import type { SaleGroup } from './virtual'
import type { Category } from '@/core/types'

// The geometry moved to `./virtual` so it can be tested without a DOM; the
// list's own consumers still import these from here.
export { HEADER_HEIGHT, ROW_HEIGHT }
export type { SaleGroup }

export interface SaleListProps {
  groups: SaleGroup[]
  settings: FormatSettings
  categoriesById: ReadonlyMap<string, Category>
  onSelect: (id: string) => void
  /** Show each row's date instead of its time (the All view reads across days). */
  showDates?: boolean
  /** Hide group headers entirely — a single-day list needs none. */
  hideHeaders?: boolean
}

function GroupHeader({ label, total }: { label: string; total: ReactNode }) {
  return (
    <div className="salelist__header salelist__header--sticky">
      <span className="salelist__header-title">{label}</span>
      <span className="salelist__header-total">{total}</span>
    </div>
  )
}

export function SaleList({
  groups,
  settings,
  categoriesById,
  onSelect,
  showDates = false,
  hideHeaders = false,
}: SaleListProps) {
  return (
    <div className="salelist">
      {groups.map((group) => (
        <div className="salelist__group" key={group.key}>
          {!hideHeaders && <GroupHeader label={group.label} total={group.total} />}
          <div className="salelist__rows">
            {group.sales.map((sale) => (
              <SaleRow
                key={sale.id}
                sale={sale}
                categoryName={categoryNameFor(sale, categoriesById)}
                settings={settings}
                onSelect={onSelect}
                showDate={showDates ? formatDate(sale.date, settings, 'short') : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ virtual list */

export function VirtualSaleList({
  groups,
  settings,
  categoriesById,
  onSelect,
  showDates = true,
}: SaleListProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const { items, offsets, headerFor } = useMemo(() => flatten(groups), [groups])
  const totalHeight = offsets[offsets.length - 1] ?? 0

  const [range, setRange] = useState({ start: 0, end: 24, firstVisible: 0 })

  useEffect(() => {
    let frame = 0

    const measure = () => {
      frame = 0
      const node = viewportRef.current
      if (!node) return
      // How far the top of the list has scrolled past the top of the viewport.
      const scrolled = -node.getBoundingClientRect().top
      const next = visibleRange(offsets, scrolled, window.innerHeight, items.length)
      setRange((prev) =>
        prev.start === next.start &&
        prev.end === next.end &&
        prev.firstVisible === next.firstVisible
          ? prev
          : next,
      )
    }

    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [offsets, items.length])

  const visible = items.slice(range.start, range.end)

  // Sticky headers cannot travel with absolutely-positioned rows, so the month
  // the reader is currently inside is pinned as one floating bar instead. It
  // follows the first item actually on screen, never `range.start` — that is
  // the overscan boundary ~400px above the viewport, and pinning from it shows
  // the previous month's name and subtotal over the next month's rows.
  const pinnedIndex = pinnedHeaderIndex(headerFor, range.firstVisible)
  const pinned = pinnedIndex >= 0 ? items[pinnedIndex] : undefined

  return (
    <div className="salelist">
      {pinned && pinned.kind === 'header' && (
        <div className="salelist__header salelist__floating" aria-hidden="true">
          <span className="salelist__header-title">{pinned.label}</span>
          <span className="salelist__header-total">{pinned.total}</span>
        </div>
      )}

      <div
        className="salelist__viewport"
        ref={viewportRef}
        style={{ height: `${totalHeight}px` }}
      >
        {visible.map((item, offset) => {
          const index = range.start + offset
          const top = offsets[index] ?? 0
          if (item.kind === 'header') {
            return (
              <div
                key={item.key}
                className="salelist__item salelist__header"
                style={{ top: `${top}px`, height: `${HEADER_HEIGHT}px` }}
              >
                <span className="salelist__header-title">{item.label}</span>
                <span className="salelist__header-total">{item.total}</span>
              </div>
            )
          }
          return (
            <div
              key={item.key}
              className="salelist__item salelist__item--sale"
              style={{ top: `${top}px`, height: `${ROW_HEIGHT}px` }}
            >
              <SaleRow
                sale={item.sale}
                categoryName={categoryNameFor(item.sale, categoriesById)}
                settings={settings}
                onSelect={onSelect}
                showDate={showDates ? formatDate(item.sale.date, settings, 'short') : undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SaleList

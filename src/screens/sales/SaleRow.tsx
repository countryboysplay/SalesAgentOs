/**
 * SaleRow — the one row every ledger view uses (§13, §16, §20).
 *
 * Cancelled sales stay in history and stay visible, with the original amount
 * struck through and a worded marker beside it (§18). Adjusted sales show the
 * figure that stands with the original struck beneath it. Colour is never the
 * only signal: every marker carries a glyph and a word.
 */
import { memo } from 'react'
import { formatCurrency, formatTime } from '@/core/format'
import type { FormatSettings } from '@/core/format'
import { effectiveAmount } from '@/core/calc'
import type { Sale } from '@/core/types'

const CancelIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="6" cy="6" r="4.6" />
    <path d="M3.6 3.6l4.8 4.8" strokeLinecap="round" />
  </svg>
)

const AdjustIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M2 8.5h8M2 3.5h8" strokeLinecap="round" />
    <circle cx="4.4" cy="3.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="7.6" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)

export function StatusMark({ status }: { status: 'cancelled' | 'adjusted' }) {
  if (status === 'cancelled') {
    return (
      <span className="statusmark statusmark--cancelled">
        <CancelIcon />
        Cancelled
      </span>
    )
  }
  return (
    <span className="statusmark statusmark--adjusted">
      <AdjustIcon />
      Adjusted
    </span>
  )
}

export interface SaleRowProps {
  sale: Sale
  /** Resolved category name — the list owns the lookup so the row stays cheap. */
  categoryName: string
  settings: FormatSettings
  onSelect: (id: string) => void
  /** Show the date instead of the time. Used by the All view. */
  showDate?: string
}

function SaleRowImpl({ sale, categoryName, settings, onSelect, showDate }: SaleRowProps) {
  const cancelled = sale.status === 'cancelled'
  const adjusted = sale.status === 'adjusted' && sale.adjustedAmount !== null
  const standing = effectiveAmount(sale)

  const original = formatCurrency(sale.amount, settings)
  const shown = cancelled ? original : formatCurrency(standing, settings)

  const srAmount = cancelled
    ? `${original}, cancelled, does not count towards net sales`
    : adjusted
      ? `${shown}, adjusted down from ${original}`
      : shown

  return (
    <button
      type="button"
      className="saleitem"
      onClick={() => onSelect(sale.id)}
      aria-label={`${categoryName}, ${srAmount}, ${showDate ?? formatTime(sale.time)}`}
    >
      <span className="saleitem__time" aria-hidden="true">
        {showDate ?? formatTime(sale.time)}
      </span>

      <span className="saleitem__body">
        <span className="saleitem__title">{categoryName}</span>
        <span className="saleitem__meta">
          {(cancelled || adjusted) && <StatusMark status={cancelled ? 'cancelled' : 'adjusted'} />}
          {sale.note ? <span>{sale.note}</span> : null}
          {!cancelled && !adjusted && !sale.note && showDate ? (
            <span>{formatTime(sale.time)}</span>
          ) : null}
        </span>
      </span>

      <span className="saleitem__amounts" aria-hidden="true">
        <span className={`saleitem__amount${cancelled ? ' saleitem__amount--struck' : ''}`}>
          {shown}
        </span>
        {adjusted && <span className="saleitem__was">{original}</span>}
      </span>
    </button>
  )
}

/**
 * Memoised on identity: the ledger re-renders on every keystroke in the search
 * box, and a thousand rows must not re-render with it.
 */
export const SaleRow = memo(SaleRowImpl)

export default SaleRow

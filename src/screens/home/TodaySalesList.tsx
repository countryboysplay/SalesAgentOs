/**
 * Today's Sales list — spec §13, §57, §70.
 *
 * Reverse-chronological, time / category / amount. Tapping a row opens Sale
 * Details; a left swipe — or the Left Arrow key, which is the keyboard
 * equivalent (§63) — reveals Edit and Delete. Delete always confirms (§13)
 * and then offers an Undo toast (§70) — the confirmation guards the tap, the
 * toast guards the decision.
 *
 * Cancelled sales stay in the list (§18) with the amount struck through and the
 * word "Cancelled" beside it, because colour is never the only signal (§63).
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, TouchEvent } from 'react'
import { Button, Card, ConfirmDialog, EmptyState, useToast } from '@/components'
import { useActions } from '@/app/store'
import { formatCurrency, formatTime } from '@/core/format'
import type { FormatSettings } from '@/core/format'
import type { Category, Sale } from '@/core/types'

/** How far a row slides to reveal its two actions. */
const ACTION_WIDTH = 156

export interface TodaySalesListProps {
  /** Every row for the day, cancelled ones included — they stay visible (§18). */
  sales: readonly Sale[]
  /**
   * The counted sales for the day: PeriodTotals.saleCount from core/calc, which
   * excludes cancellations. Never sales.length — the header and the Today card
   * have to agree, and the card counts net (§18).
   */
  saleCount: number
  categoriesById: Map<string, Category>
  settings: FormatSettings
  onOpenDetails: (sale: Sale) => void
  onEdit: (sale: Sale) => void
  onAddSale: () => void
}

export function TodaySalesList({
  sales,
  saleCount,
  categoriesById,
  settings,
  onOpenDetails,
  onEdit,
  onAddSale,
}: TodaySalesListProps) {
  const { deleteSale, restoreSale } = useActions()
  const { undoable } = useToast()
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Sale | null>(null)

  const confirmDelete = () => {
    const sale = pendingDelete
    setPendingDelete(null)
    setRevealedId(null)
    if (!sale) return
    const removed = deleteSale(sale.id)
    if (removed) undoable('Sale deleted', () => restoreSale(removed), { key: 'sale-deleted' })
  }

  // Two different questions. How many rows are there to show (cancelled ones
  // included, §18), and how many sales are counted — which is the card's
  // figure, from core/calc, and excludes cancellations.
  const rowCount = sales.length

  return (
    <Card
      padding="sm"
      className="today-list"
      title="Today's Sales"
      headerAction={
        rowCount > 0 ? (
          <span className="today-list__count">
            {saleCount} {saleCount === 1 ? 'sale' : 'sales'}
          </span>
        ) : undefined
      }
    >
      {rowCount === 0 ? (
        <EmptyState
          compact
          title="Nothing on the board yet."
          body="Record your first sale when it comes in."
          action={
            <Button variant="primary" onClick={onAddSale}>
              Add Sale
            </Button>
          }
        />
      ) : (
        <ul className="today-list__rows">
          {sales.map((sale) => (
            <SaleRow
              key={sale.id}
              sale={sale}
              categoryName={
                sale.categoryId ? (categoriesById.get(sale.categoryId)?.name ?? null) : null
              }
              settings={settings}
              revealed={revealedId === sale.id}
              onReveal={(open) => setRevealedId(open ? sale.id : null)}
              onOpenDetails={() => onOpenDetails(sale)}
              onEdit={() => {
                setRevealedId(null)
                onEdit(sale)
              }}
              onDelete={() => setPendingDelete(sale)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete this sale?"
        body={
          pendingDelete
            ? `${formatCurrency(pendingDelete.amount, settings)} at ${formatTime(pendingDelete.time)}. It leaves your ledger entirely — to keep it in history instead, mark it cancelled.`
            : undefined
        }
        confirmLabel="Delete"
      />
    </Card>
  )
}

/* --------------------------------------------------------------------- row */

interface SaleRowProps {
  sale: Sale
  categoryName: string | null
  settings: FormatSettings
  revealed: boolean
  onReveal: (open: boolean) => void
  onOpenDetails: () => void
  onEdit: () => void
  onDelete: () => void
}

function SaleRow({
  sale,
  categoryName,
  settings,
  revealed,
  onReveal,
  onOpenDetails,
  onEdit,
  onDelete,
}: SaleRowProps) {
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<'none' | 'x' | 'y'>('none')
  const mainRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const wasRevealed = useRef(false)

  // Keyboard equivalent of the swipe. Focus follows the reveal in both
  // directions, so the actions are reachable and escapable without a pointer.
  useEffect(() => {
    if (revealed && !wasRevealed.current) editRef.current?.focus()
    else if (!revealed && wasRevealed.current) mainRef.current?.focus()
    wasRevealed.current = revealed
  }, [revealed])

  const onRowKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft' && !revealed) {
      event.preventDefault()
      onReveal(true)
    } else if ((event.key === 'ArrowRight' || event.key === 'Escape') && revealed) {
      event.preventDefault()
      onReveal(false)
    }
  }

  const cancelled = sale.status === 'cancelled'
  const amount = formatCurrency(sale.amount, settings)
  const time = formatTime(sale.time)
  const label = categoryName ?? 'Uncategorised'

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    start.current = { x: touch.clientX, y: touch.clientY }
    axis.current = 'none'
  }

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!start.current) return
    const touch = event.touches[0]
    const dx = touch.clientX - start.current.x
    const dy = touch.clientY - start.current.y

    if (axis.current === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      // A vertical intent belongs to the page, not the row.
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axis.current !== 'x') return

    const base = revealed ? -ACTION_WIDTH : 0
    const next = Math.min(0, Math.max(-ACTION_WIDTH, base + dx))
    setDrag(next)
  }

  const onTouchEnd = () => {
    if (axis.current === 'x' && drag !== null) {
      onReveal(drag < -ACTION_WIDTH / 2)
    }
    setDrag(null)
    start.current = null
    axis.current = 'none'
  }

  const offset = drag ?? (revealed ? -ACTION_WIDTH : 0)

  return (
    <li className="sale-row" onKeyDown={onRowKeyDown}>
      {revealed && (
        <div className="sale-row__actions" role="group" aria-label={`Actions for ${label}, ${amount}`}>
          <Button ref={editRef} size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="danger-quiet" onClick={onDelete}>
            Delete
          </Button>
        </div>
      )}

      <div
        className="sale-row__slider"
        style={{
          transform: `translateX(${offset}px)`,
          transition: drag === null ? 'transform var(--dur-base) var(--ease-standard)' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <button
          ref={mainRef}
          type="button"
          className="sale-row__main focus-inset"
          aria-expanded={revealed}
          onClick={() => (revealed ? onReveal(false) : onOpenDetails())}
        >
          <span className="sale-row__time num">{time}</span>
          <span className="sale-row__label">
            {label}
            {cancelled && <span className="sale-row__tag">Cancelled</span>}
          </span>
          <span
            className={`sale-row__amount num${cancelled ? ' sale-row__amount--struck' : ''}`}
            aria-hidden="true"
          >
            {amount}
          </span>
          <span className="sr-only">
            {amount}
            {cancelled ? ', cancelled — not counted in net sales' : ''}.{' '}
            {revealed
              ? 'Edit and delete actions shown. Press Right Arrow or Escape to hide them.'
              : 'Open sale details. Press Left Arrow for edit and delete.'}
          </span>
        </button>
      </div>
    </li>
  )
}

export default TodaySalesList

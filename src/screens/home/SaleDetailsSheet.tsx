/**
 * Sale Details, Cancel and Delete — spec §15, §16, §17, §18, §70.
 *
 * The point of §17 is that an agent should never have to delete a sale that
 * merely fell through: Mark Cancelled keeps the record in history, stops it
 * counting toward net, and can be reversed. Delete is the rarer, harsher path,
 * so it confirms first (§13) and still offers Undo afterwards (§70).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, ConfirmDialog, Sheet, useToast } from '@/components'
import { useActions, useCategories, useSettings } from '@/app/store'
import { todayIso } from '@/core/date'
import { formatBasisPoints, formatCurrency, formatDate, formatTime } from '@/core/format'
import type { Sale } from '@/core/types'
import './SaleSheet.css'

export interface SaleDetailsSheetProps {
  open: boolean
  sale: Sale | null
  onClose: () => void
  onEdit: (sale: Sale) => void
}

export function SaleDetailsSheet({ open, sale, onClose, onEdit }: SaleDetailsSheetProps) {
  const settings = useSettings()
  const { categoriesById } = useCategories()
  const { cancelSale, uncancelSale, deleteSale, restoreSale } = useActions()
  const { undoable, success } = useToast()

  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [cancelledOn, setCancelledOn] = useState(todayIso())
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (open) {
      setCancelling(false)
      setReason('')
      setCancelledOn(todayIso())
      setConfirmDelete(false)
    }
  }, [open, sale?.id])

  if (!sale) return null

  const cancelled = sale.status === 'cancelled'
  const category = sale.categoryId ? (categoriesById.get(sale.categoryId) ?? null) : null
  const amount = formatCurrency(sale.amount, settings)

  const doCancel = () => {
    cancelSale(sale.id, reason.trim() === '' ? null : reason.trim(), cancelledOn)
    undoable('Sale cancelled', () => uncancelSale(sale.id), { key: 'sale-cancelled' })
    onClose()
  }

  /* Ids are namespaced because this sheet can be on screen at the same time
     as the sale editor, and a duplicate id silently breaks label[for]. */
  const uid = useId()
  const reasonId = `${uid}-cancel-reason`
  const dateId = `${uid}-cancel-date`

  /* Switching to the cancel sub-form swaps the whole body and the footer.
     Without moving focus, a keyboard or screen-reader user presses "Mark
     Cancelled", the fields appear below them, and nothing says so. */
  const reasonRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (cancelling) reasonRef.current?.focus()
  }, [cancelling])

  const doUncancel = () => {
    uncancelSale(sale.id)
    success('Sale is active again', { key: 'sale-cancelled' })
    onClose()
  }

  const doDelete = () => {
    setConfirmDelete(false)
    const removed = deleteSale(sale.id)
    onClose()
    if (removed) undoable('Sale deleted', () => restoreSale(removed), { key: 'sale-deleted' })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Sale Details"
      description={formatDate(sale.date, settings, 'weekday')}
      footer={
        cancelling ? (
          <div className="sale-sheet__footer-row">
            <Button block onClick={() => setCancelling(false)}>
              Back
            </Button>
            <Button variant="primary" block onClick={doCancel}>
              Mark Cancelled
            </Button>
          </div>
        ) : (
          <Button variant="primary" size="lg" block onClick={() => onEdit(sale)}>
            Edit Sale
          </Button>
        )
      }
    >
      <div className="sale-sheet sale-sheet--details">
        <p className="sale-details__amount num">{amount}</p>
        <p className="sale-details__when">
          {formatDate(sale.date, settings, 'medium')} · {formatTime(sale.time)}
        </p>

        {cancelled && sale.cancellation && (
          <div className="sale-details__notice" role="note">
            <p className="sale-details__notice-title">
              Cancelled on {formatDate(sale.cancellation.cancelledOn, settings, 'medium')}
            </p>
            <p className="sale-details__notice-body">
              {sale.cancellation.reason ? `${sale.cancellation.reason}. ` : ''}
              It stays in your history for the record, and no longer counts toward net sales.
            </p>
            <Button size="sm" onClick={doUncancel}>
              Make active again
            </Button>
          </div>
        )}

        {cancelling ? (
          <div className="sale-sheet__section">
            <div className="sale-sheet__inline-field">
              <label className="sale-sheet__label" htmlFor={reasonId}>
                Reason <span className="sale-sheet__optional">— optional</span>
              </label>
              <input
                ref={reasonRef}
                id={reasonId}
                className="sale-sheet__input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Fell through, duplicate, changed mind…"
                maxLength={140}
                autoComplete="off"
              />
            </div>
            <div className="sale-sheet__inline-field">
              <label className="sale-sheet__label" htmlFor={dateId}>
                Date cancelled
              </label>
              <input
                id={dateId}
                type="date"
                className="sale-sheet__input"
                value={cancelledOn}
                onChange={(e) => e.target.value && setCancelledOn(e.target.value)}
              />
            </div>
            <p className="sale-sheet__hint">
              The sale stays in your ledger. Gross keeps it; net does not.
            </p>
          </div>
        ) : (
          <>
            <dl className="sale-details__rows">
              <Row label="Category" value={category?.name ?? 'Uncategorised'} />
              {settings.commissionEnabled && (
                <Row
                  label="Commission"
                  value={`${formatBasisPoints(sale.commissionRate, settings)} · ${formatCurrency(
                    sale.commissionAmount,
                    settings,
                    { decimals: 'always' },
                  )}`}
                />
              )}
              <Row
                label="Status"
                value={
                  cancelled ? 'Cancelled' : sale.status === 'adjusted' ? 'Adjusted' : 'Active'
                }
              />
              {sale.adjustedAmount !== null && (
                <Row
                  label="Counts as"
                  value={formatCurrency(sale.adjustedAmount, settings)}
                />
              )}
              {sale.note && <Row label="Note" value={sale.note} />}
            </dl>

            <div className="sale-details__actions">
              {!cancelled && (
                <Button block onClick={() => setCancelling(true)}>
                  Mark Cancelled
                </Button>
              )}
              <Button variant="danger-quiet" block onClick={() => setConfirmDelete(true)}>
                Delete Sale
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title="Delete this sale?"
        body={`${amount} on ${formatDate(sale.date, settings, 'medium')}. It leaves your ledger entirely — to keep it in history instead, mark it cancelled.`}
        confirmLabel="Delete"
      />
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="sale-details__row">
      <dt className="sale-details__row-label">{label}</dt>
      <dd className="sale-details__row-value">{value}</dd>
    </div>
  )
}

export default SaleDetailsSheet

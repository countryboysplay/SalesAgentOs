/**
 * Add Sale — spec §14, §55. The highest-frequency action in the product (§76).
 *
 * DEFAULT EXPORT is the globally-mounted sheet: it reads useAddSale() so the
 * shell's + Sale button works from every tab. Mount it once, in App.tsx:
 *
 *   import AddSaleSheet from '@/screens/home/AddSaleSheet'
 *   <AppShell overlays={<AddSaleSheet />}>
 *
 * The same component in edit mode is exported as <SaleEditorSheet>, so editing
 * a sale is literally the same three fields the agent already knows (§17).
 *
 * THREE INTERACTIONS (§14): open, type the amount, press Record Sale. Category,
 * commission, date, time and note all carry working defaults, and the amount
 * field is focused the moment the sheet opens, so nothing else is required.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Chip, ChipRow, NumericKeypad, KeypadDisplay, Sheet, useToast } from '@/components'
import { useActions, useAddSale, useCategories, useSales, useSettings } from '@/app/store'
import { commissionFor } from '@/core/money'
import { compareIso, nowTime, todayIso } from '@/core/date'
import { formatBasisPoints, formatCurrency, formatDate, formatTime } from '@/core/format'
import type { Category, NewSaleInput, Sale } from '@/core/types'
import {
  currencySymbol,
  parseRate,
  plainAmount,
  rateOverrideForCategory,
  rateToText,
  resolveRate,
  useRecentCategories,
} from './saleFields'
import './SaleSheet.css'

export interface SaleEditorSheetProps {
  open: boolean
  onClose: () => void
  /** Present in edit mode. Omit to record a new sale. */
  sale?: Sale | null
  /** Seed values for a new sale, from useAddSale().prefill. */
  prefill?: Partial<NewSaleInput> | null
}

interface Draft {
  amount: number
  categoryId: string | null
  /**
   * The per-sale rate override, as typed. null means "leave the rate to the
   * normal rule" — nothing is overridden.
   *
   * Only an actual edit puts a value here. Opening the Change panel used to
   * write the current rate into it, which pinned that figure permanently: Done
   * closed the panel but left the override set, so a later category with its own
   * rule was silently ignored and the wrong rate froze onto the record (§69).
   */
  rateText: string | null
  date: string
  time: string
  note: string
}

function draftFor(sale: Sale | null, prefill: Partial<NewSaleInput> | null): Draft {
  if (sale) {
    return {
      amount: sale.amount,
      categoryId: sale.categoryId,
      // A sale keeps the rate frozen at write time (§69), so an untouched edit
      // must not re-resolve it — hence null, not the sale's rate as text.
      rateText: null,
      date: sale.date,
      time: sale.time,
      note: sale.note ?? '',
    }
  }
  return {
    amount: prefill?.amount ?? 0,
    categoryId: prefill?.categoryId ?? null,
    rateText: prefill?.commissionRate == null ? null : rateToText(prefill.commissionRate),
    date: prefill?.date ?? todayIso(),
    time: prefill?.time ?? nowTime(),
    note: prefill?.note ?? '',
  }
}

export function SaleEditorSheet({ open, onClose, sale = null, prefill = null }: SaleEditorSheetProps) {
  const settings = useSettings()
  const { activeCategories, categoriesById } = useCategories()
  const { sortedSales } = useSales()
  const { addSale, updateSale } = useActions()
  const { success } = useToast()

  const editing = sale !== null
  const amountRef = useRef<HTMLDivElement>(null)

  const [draft, setDraft] = useState<Draft>(() => draftFor(sale, prefill))
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [showWhen, setShowWhen] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [rateOpen, setRateOpen] = useState(false)

  // Reset every time the sheet opens: an abandoned draft must never leak into
  // the next sale.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      const next = draftFor(sale, prefill)
      setDraft(next)
      setShowAllCategories(false)
      // Open the date field when it arrives already in the future, so the
      // control that fixes it is next to the message saying it needs fixing.
      setShowWhen(compareIso(next.date, todayIso()) > 0)
      setShowNote(next.note !== '')
      setRateOpen(false)
    }
    wasOpen.current = open
  }, [open, sale, prefill])

  const recent = useRecentCategories(sortedSales, categoriesById, activeCategories)
  const chips: Category[] = showAllCategories ? activeCategories : recent

  const category = draft.categoryId ? (categoriesById.get(draft.categoryId) ?? null) : null

  // Explicit override -> the sale's own frozen rate when editing -> category
  // rule -> global default. Mirrors the repository's resolveCommissionRate, so
  // the estimate on screen is the rate that actually gets frozen (§69).
  const typedRate = draft.rateText === null ? null : parseRate(draft.rateText)
  const effectiveRate = resolveRate(typedRate, sale, category, settings.defaultCommissionRate)
  const estimate = commissionFor(draft.amount, effectiveRate)
  /** The rate the normal rule would give — what "use the usual rate" returns to. */
  const ruleRate = resolveRate(null, sale, category, settings.defaultCommissionRate)
  /** There is an override to clear — it may be half-typed or not a rate at all. */
  const overridden = draft.rateText !== null
  /** The override is a rate, and it is the one that will be frozen (§69). */
  const overrideApplies = typedRate !== null
  /** Typed something that is not a rate. Mid-edit emptiness is not an error. */
  const rateUnreadable =
    draft.rateText !== null && draft.rateText.trim() !== '' && !overrideApplies

  /* This editor is mounted TWICE at once: globally for Add Sale (via
     useAddSale) and again inside HomeScreen for Edit. Literal ids therefore
     appeared twice in one document, and a duplicate id breaks every
     label[for] and aria-describedby association it takes part in - AT resolves
     the id to whichever node it finds first. useId gives each instance its
     own namespace. */
  const uid = useId()
  const fieldId = (name: string) => `${uid}-${name}`

  // The keypad's glyph follows the configured currency, so the figure a sighted
  // agent reads matches the one the aria-label announces.
  const symbol = currencySymbol(settings)

  const patch = (next: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...next }))

  const isToday = draft.date === todayIso()
  /**
   * A future date is not a sale yet. It is invisible on Home, in every Insights
   * range and in this year's totals, yet all-time Personal Records still counts
   * it — a "best day" no view can show. `max` on the input is advisory (there is
   * no form to enforce it, and the field can be typed into), so the check has to
   * live at submit.
   */
  const isFutureDate = compareIso(draft.date, todayIso()) > 0
  const canSave = draft.amount > 0 && !isFutureDate

  const submit = () => {
    if (!canSave) return
    const note = draft.note.trim() === '' ? null : draft.note.trim()

    if (editing && sale) {
      updateSale(sale.id, {
        amount: draft.amount,
        date: draft.date,
        time: draft.time,
        categoryId: draft.categoryId,
        // Only send a rate when the agent actually changed it; otherwise the
        // store re-freezes from the sale's OWN rate rather than today's default.
        ...(typedRate !== null && typedRate !== sale.commissionRate
          ? { commissionRate: typedRate }
          : {}),
        note,
      })
      success(`${formatCurrency(draft.amount, settings)} updated`, {
        detail: detailLine(category, draft.time),
        key: 'sale-saved',
      })
    } else {
      const created = addSale({
        amount: draft.amount,
        date: draft.date,
        time: draft.time,
        categoryId: draft.categoryId,
        ...(typedRate !== null ? { commissionRate: typedRate } : {}),
        note,
      })
      success(`${formatCurrency(created.amount, settings)} added`, {
        detail: detailLine(category, created.time),
        key: 'sale-added',
      })
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Sale' : 'Add Sale'}
      fullHeight
      initialFocus={amountRef}
      footer={
        <Button variant="primary" size="lg" block disabled={!canSave} onClick={submit}>
          {editing ? 'Save Changes' : 'Record Sale'}
        </Button>
      }
    >
      <div className="sale-sheet">
        {/* ------------------------------------------------ amount (§14) */}
        <div
          className="sale-sheet__amount"
          ref={amountRef}
          tabIndex={-1}
          aria-label="Sale amount. Type the digits, or use the keypad below."
        >
          <KeypadDisplay
            formatted={plainAmount(draft.amount, settings, symbol)}
            symbol={symbol}
            empty={draft.amount === 0}
            ariaLabel={`Sale amount ${formatCurrency(draft.amount, settings)}`}
          />
        </div>
        <NumericKeypad value={draft.amount} onChange={(cents) => patch({ amount: cents })} />

        {/* ---------------------------------------------- category (§14) */}
        {activeCategories.length > 0 && (
          <section className="sale-sheet__section">
            <div className="sale-sheet__section-head">
              <h3 className="eyebrow">Category</h3>
              {activeCategories.length > chips.length || showAllCategories ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAllCategories((v) => !v)}
                  aria-expanded={showAllCategories}
                >
                  {showAllCategories ? 'Recent' : 'All categories'}
                </Button>
              ) : null}
            </div>
            <ChipRow wrap={showAllCategories} label="Sale category">
              {chips.map((cat) => (
                <Chip
                  key={cat.id}
                  selected={draft.categoryId === cat.id}
                  icon={cat.icon ?? undefined}
                  onClick={() => {
                    const nextId = draft.categoryId === cat.id ? null : cat.id
                    const next = nextId ? cat : null
                    patch({
                      categoryId: nextId,
                      // A category with its own commission rule replaces a
                      // per-sale override rather than being overruled by it.
                      rateText: rateOverrideForCategory(draft.rateText, next),
                    })
                  }}
                >
                  {cat.name}
                </Chip>
              ))}
            </ChipRow>
          </section>
        )}

        {/* -------------------------------------------- commission (§14) */}
        {settings.commissionEnabled && (
          <section className="sale-sheet__section">
            <div className="sale-sheet__row">
              <span className="sale-sheet__row-label">Commission</span>
              <span className="sale-sheet__row-value">
                <span className="num">{formatBasisPoints(effectiveRate, settings)}</span>
                {overrideApplies && <span className="sale-sheet__tag">Custom</span>}
                <span className="sale-sheet__estimate">
                  {formatCurrency(estimate, settings, { decimals: 'always' })} est.
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setRateOpen((v) => !v)} aria-expanded={rateOpen}>
                {rateOpen ? 'Done' : 'Change'}
              </Button>
            </div>

            {/* The way back to the rule, visible whether or not the panel is
                open — closing the panel used to hide the only reset there was. */}
            {overridden && !rateOpen && (
              <div className="sale-sheet__row sale-sheet__row--reset">
                <span className="sale-sheet__hint">
                  A custom rate for this sale only.
                </span>
                <Button size="sm" variant="ghost" onClick={() => patch({ rateText: null })}>
                  Use {formatBasisPoints(ruleRate, settings)}
                </Button>
              </div>
            )}

            {rateOpen && (
              <div className="sale-sheet__inline-field">
                <label className="sale-sheet__label" htmlFor={fieldId('rate')}>
                  Rate for this sale
                </label>
                <div className="sale-sheet__suffixed">
                  <input
                    id={fieldId('rate')}
                    className="sale-sheet__input"
                    // Shows the rate in force. Until it is edited that is the
                    // rule's rate, and nothing is overridden.
                    value={draft.rateText ?? rateToText(effectiveRate)}
                    onChange={(e) => patch({ rateText: e.target.value })}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={rateToText(settings.defaultCommissionRate)}
                    aria-describedby={
                      rateUnreadable
                        ? `${fieldId('rate-problem')} ${fieldId('rate-hint')}`
                        : fieldId('rate-hint')
                    }
                    aria-invalid={rateUnreadable ? true : undefined}
                  />
                  <span className="sale-sheet__suffix">%</span>
                </div>
                <p className="sale-sheet__hint" id={fieldId('rate-hint')}>
                  Applies to this sale only. Your default stays{' '}
                  {formatBasisPoints(settings.defaultCommissionRate, settings)}.
                </p>
                {rateUnreadable && (
                  <p className="sale-sheet__error" id={fieldId('rate-problem')}>
                    That is not a rate, so this sale keeps{' '}
                    {formatBasisPoints(ruleRate, settings)}. Use a number, like 5 or 3.25.
                  </p>
                )}
                {overridden && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      patch({ rateText: null })
                      setRateOpen(false)
                    }}
                  >
                    Use the usual rate ({formatBasisPoints(ruleRate, settings)})
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------- date & time (§14) */}
        <section className="sale-sheet__section">
          <div className="sale-sheet__row">
            <span className="sale-sheet__row-label">When</span>
            <span className="sale-sheet__row-value">
              {isToday ? 'Today' : formatDate(draft.date, settings, 'medium')}
              <span className="sale-sheet__estimate">{formatTime(draft.time)}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowWhen((v) => !v)}
              aria-expanded={showWhen}
            >
              {showWhen ? 'Done' : 'Change'}
            </Button>
          </div>

          {isFutureDate && (
            <p className="sale-sheet__error" id={fieldId('date-error')} role="alert">
              {formatDate(draft.date, settings, 'medium')} has not happened yet. Pick today or an
              earlier day — a sale dated ahead of today is left out of every total on Home and in
              Insights.
            </p>
          )}

          {showWhen && (
            <div className="sale-sheet__when">
              <div className="sale-sheet__inline-field">
                <label className="sale-sheet__label" htmlFor={fieldId('date')}>
                  Date
                </label>
                <input
                  id={fieldId('date')}
                  type="date"
                  className="sale-sheet__input"
                  value={draft.date}
                  max={todayIso()}
                  onChange={(e) => e.target.value && patch({ date: e.target.value })}
                  aria-invalid={isFutureDate ? true : undefined}
                  aria-describedby={isFutureDate ? fieldId('date-error') : undefined}
                />
              </div>
              <div className="sale-sheet__inline-field">
                <label className="sale-sheet__label" htmlFor={fieldId('time')}>
                  Time
                </label>
                <input
                  id={fieldId('time')}
                  type="time"
                  className="sale-sheet__input"
                  value={draft.time}
                  onChange={(e) => e.target.value && patch({ time: e.target.value })}
                />
              </div>
            </div>
          )}
        </section>

        {/* ------------------------------------------------- note (§14, §5) */}
        <section className="sale-sheet__section">
          {showNote ? (
            <div className="sale-sheet__inline-field">
              <label className="sale-sheet__label" htmlFor={fieldId('note')}>
                Note
              </label>
              <textarea
                id={fieldId('note')}
                className="sale-sheet__input sale-sheet__textarea"
                value={draft.note}
                onChange={(e) => patch({ note: e.target.value })}
                rows={3}
                maxLength={280}
                placeholder="Renewal, referral, upsell…"
                aria-describedby={fieldId('note-hint')}
              />
              <p className="sale-sheet__hint" id={fieldId('note-hint')}>
                A word or two for you. No need for customer names or numbers.
              </p>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setShowNote(true)}>
              + Add note
            </Button>
          )}
        </section>
      </div>
    </Sheet>
  )
}

/** "Aeration · 2:07 PM" — the toast's second line. */
function detailLine(category: Category | null, time: string): string {
  const when = formatTime(time)
  return category ? `${category.name} · ${when}` : when
}

/* ------------------------------------------------------- global mounting */

/**
 * The single, globally-mounted Add Sale sheet. Reads its open state from
 * useAddSale(), which the shell's + Sale button and rail button both drive.
 */
export default function AddSaleSheet() {
  const { isOpen, prefill, close } = useAddSale()
  return <SaleEditorSheet open={isOpen} prefill={prefill} onClose={close} />
}

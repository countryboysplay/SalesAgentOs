import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import './Sheet.css'

/* ---------------------------------------------------------------- scroll lock
   Reference-counted so nested overlays (a ConfirmDialog opened from inside a
   Sheet) do not release the lock early. position:fixed is the only lock iOS
   Safari honours, so the scroll offset has to be saved and restored. */

let lockCount = 0
let savedScrollY = 0

export function lockBodyScroll(): void {
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    document.body.style.top = `-${savedScrollY}px`
    document.body.classList.add('is-scroll-locked')
  }
  lockCount += 1
}

export function unlockBodyScroll(): void {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.classList.remove('is-scroll-locked')
    document.body.style.top = ''
    window.scrollTo(0, savedScrollY)
  }
}

/* ---------------------------------------------------------------- focus trap */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * Overlay stack. Both handlers below are bound on `document` in the CAPTURE
 * phase, so when a ConfirmDialog opens on top of a Sheet BOTH traps used to
 * run for the same keystroke: Escape closed the dialog and the sheet
 * underneath it, and Tab was fought over by two wrap-around handlers.
 * stopPropagation cannot fix that (listeners on the same node still all fire),
 * so only the topmost trap is allowed to act.
 */
const trapStack: symbol[] = []

/**
 * Traps Tab inside `ref`, closes on Escape, and restores focus to whatever was
 * focused before the overlay opened. Shared by Sheet and ConfirmDialog.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  options: { initialFocus?: React.RefObject<HTMLElement | null>; closeOnEscape?: boolean } = {},
): void {
  const { initialFocus, closeOnEscape = true } = options
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const node = ref.current
    if (!node) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const token = Symbol('overlay')
    trapStack.push(token)
    const isTopmost = () => trapStack[trapStack.length - 1] === token

    // Give the browser a frame so the sheet is laid out before focusing.
    const raf = requestAnimationFrame(() => {
      const target = initialFocus?.current ?? getFocusable(node)[0] ?? node
      target.focus({ preventScroll: true })
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return
      if (event.key === 'Escape' && closeOnEscape) {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusable(node)
      if (focusable.length === 0) {
        event.preventDefault()
        node.focus()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown, true)
      const at = trapStack.lastIndexOf(token)
      if (at !== -1) trapStack.splice(at, 1)
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open, ref, initialFocus, closeOnEscape])
}

/* --------------------------------------------------------------------- Sheet */

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** Visible title. Wired to aria-labelledby. Required for accessibility. */
  title: ReactNode
  /** Optional supporting line under the title, wired to aria-describedby. */
  description?: ReactNode
  children: ReactNode
  /** Sticky action row at the foot — put "Record Sale" here. */
  footer?: ReactNode
  /** Mobile: cover the full screen instead of hugging the bottom. */
  fullHeight?: boolean
  /** Desktop: 760px instead of 560px. */
  wide?: boolean
  /** Remove the body's horizontal padding, for edge-to-edge lists. */
  flushBody?: boolean
  /** Hide the top-right close button (the scrim and Escape still close). */
  hideClose?: boolean
  /** Disable drag-to-dismiss on touch. Default: enabled. */
  disableDrag?: boolean
  /** Blocks scrim-click and Escape. Use only for genuinely blocking flows. */
  dismissible?: boolean
  /** Focus this element on open instead of the first focusable node. */
  initialFocus?: React.RefObject<HTMLElement | null>
  className?: string
}

const DISMISS_DISTANCE = 96

/**
 * Sheet — bottom sheet on mobile, centred modal on desktop.
 *
 * Handles: portal, scrim, aria-modal + labelled title, focus trap, Escape,
 * body scroll lock, and drag-to-dismiss via the grabber.
 *
 * Only ONE Add Sale sheet should exist in the tree; open it through
 * `useAddSale()` from the store rather than mounting a second copy.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  fullHeight = false,
  wide = false,
  flushBody = false,
  hideClose = false,
  disableDrag = false,
  dismissible = true,
  initialFocus,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const titleId = useId()
  const descId = useId()

  const requestClose = useCallback(() => {
    if (dismissible) onClose()
  }, [dismissible, onClose])

  useFocusTrap(panelRef, open, requestClose, { initialFocus, closeOnEscape: dismissible })

  useEffect(() => {
    if (!open) return
    lockBodyScroll()

    // Belt-and-suspenders against mobile Safari: useFocusTrap focuses
    // `initialFocus` with `preventScroll: true`, but WebKit does not always
    // honour that flag, especially inside a nested scroll container (the
    // installed-PWA "Add Sale" sheet, focused on its amount display). When it
    // doesn't, the sheet opens already scrolled part-way down — the header
    // sits outside .sheet__body so it looks fine, but everything above the
    // scroll offset (the amount display, the first keypad row) renders
    // clipped. Force the body back to the top on the same frame the focus
    // call lands, so any native scroll-into-view is overridden rather than
    // raced.
    const body = panelRef.current?.querySelector<HTMLElement>('.sheet__body')
    const raf = requestAnimationFrame(() => {
      if (body) body.scrollTop = 0
    })

    return () => {
      cancelAnimationFrame(raf)
      unlockBodyScroll()
    }
  }, [open])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disableDrag || event.pointerType === 'mouse') return
    dragStartY.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null || !panelRef.current) return
    const dy = Math.max(0, event.clientY - dragStartY.current)
    panelRef.current.style.transform = `translateY(${dy}px)`
    panelRef.current.style.transition = 'none'
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null || !panelRef.current) return
    const dy = event.clientY - dragStartY.current
    dragStartY.current = null
    panelRef.current.style.transition = ''
    panelRef.current.style.transform = ''
    if (dy > DISMISS_DISTANCE) requestClose()
  }

  if (!open) return null

  return createPortal(
    <>
      <div className="sheet-scrim" onClick={requestClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={[
          'sheet',
          fullHeight ? 'sheet--full' : '',
          wide ? 'sheet--wide' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        {!disableDrag && (
          <div
            className="sheet__grabber"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-hidden="true"
          />
        )}

        <div className="sheet__header">
          <h2 className="sheet__title" id={titleId}>
            {title}
          </h2>
          {!hideClose && dismissible && (
            <button type="button" className="sheet__close" onClick={requestClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        {description && (
          <p className="sheet__description" id={descId}>
            {description}
          </p>
        )}

        <div className={`sheet__body${flushBody ? ' sheet__body--flush' : ''}`}>{children}</div>

        {footer && <div className="sheet__footer">{footer}</div>}
      </div>
    </>,
    document.body,
  )
}

export default Sheet

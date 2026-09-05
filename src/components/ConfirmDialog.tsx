import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { lockBodyScroll, unlockBodyScroll, useFocusTrap } from './Sheet'
import './ConfirmDialog.css'

export interface ConfirmDialogProps {
  open: boolean
  /** Called on cancel, Escape, or scrim click. */
  onCancel: () => void
  /** Called when the confirm button is pressed (and the word matches). */
  onConfirm: () => void
  title: ReactNode
  /**
   * Explain the consequence in plain words and real figures.
   * §44: "Delete 1,482 sales and all settings from this device?"
   */
  body?: ReactNode
  /** Confirm button label. Default "Delete". */
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' (default) or 'primary' for non-destructive confirmations. */
  tone?: 'danger' | 'primary'
  /**
   * Type-to-confirm. Set to 'DELETE' for the Reset App flow (§44); the
   * confirm button stays disabled until the input matches exactly.
   */
  requireTypedWord?: string
  /** Label above the input. Default is generated from requireTypedWord. */
  typedWordLabel?: ReactNode
}

/**
 * ConfirmDialog — the guard in front of every destructive action.
 *
 * Two modes:
 *   1. Plain confirmation — "Delete this sale?" (§13).
 *   2. Type-the-word — requireTypedWord="DELETE" for Reset App (§44).
 *
 * Pair a delete with an Undo toast (§70) wherever the action is reversible;
 * this dialog is for the ones that are not.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  tone = 'danger',
  requireTypedWord,
  typedWordLabel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [typed, setTyped] = useState('')
  const titleId = useId()
  const bodyId = useId()

  useFocusTrap(panelRef, open, onCancel, { initialFocus: cancelRef })

  useEffect(() => {
    if (!open) return
    setTyped('')
    lockBodyScroll()
    return unlockBodyScroll
  }, [open])

  if (!open) return null

  const gated = Boolean(requireTypedWord)
  const matches = !gated || typed.trim() === requireTypedWord

  return createPortal(
    <>
      <div className="confirm-scrim" onClick={onCancel} aria-hidden="true" />
      <div
        ref={panelRef}
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        tabIndex={-1}
      >
        <h2 className="confirm__title" id={titleId}>
          {title}
        </h2>
        {body && (
          <p className="confirm__body" id={bodyId}>
            {body}
          </p>
        )}

        {gated && (
          <div className="confirm__field">
            <label
              className="confirm__label"
              id={`${titleId}-label`}
              htmlFor={`${titleId}-input`}
            >
              {typedWordLabel ?? (
                <>
                  Type <code>{requireTypedWord}</code> to confirm
                </>
              )}
            </label>
            <input
              id={`${titleId}-input`}
              className="confirm__input"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={body ? bodyId : undefined}
            />
          </div>
        )}

        <div className="confirm__actions">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={!matches}
            /* Without this, a screen-reader user meets a disabled button with
               no stated reason. Pointing at the type-the-word label explains
               the gate. */
            aria-describedby={gated ? `${titleId}-label` : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}

export default ConfirmDialog

import { useCallback, useEffect } from 'react'
import './NumericKeypad.css'

/** Hard ceiling so a stuck key cannot produce a nonsense figure. $9,999,999.99 */
export const MAX_AMOUNT_CENTS = 999_999_999

/**
 * Cash-register entry: every keystroke shifts the value left by one decimal
 * place. Typing 3-8-9-0-0 yields 38900 cents ($389.00).
 */
export function appendDigit(cents: number, digit: number): number {
  const next = cents * 10 + digit
  return next > MAX_AMOUNT_CENTS ? cents : next
}

/** Backspace: shift right one place. */
export function removeDigit(cents: number): number {
  return Math.floor(cents / 10)
}

export interface NumericKeypadProps {
  /** Current amount in INTEGER CENTS (never a float — see types.ts). */
  value: number
  /** Called with the new cents value on every key. */
  onChange: (cents: number) => void
  /**
   * Bind to the physical keyboard too (digits, Backspace, Delete).
   * Default true — the desktop modal must be typeable.
   */
  captureKeyboard?: boolean
  /** Show a "00" key. Default true; sale amounts are usually round. */
  showDoubleZero?: boolean
  /** Disables every key. */
  disabled?: boolean
  /** Accessible group name. Default "Sale amount keypad". */
  label?: string
  className?: string
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/**
 * NumericKeypad — large-target amount entry (§14, §55).
 *
 * The component owns only the arithmetic on `value`; render the figure with
 * <KeypadDisplay> (or your own markup) above it. It emits INTEGER CENTS, so
 * the money invariant is preserved end to end — no float ever exists.
 */
export function NumericKeypad({
  value,
  onChange,
  captureKeyboard = true,
  showDoubleZero = true,
  disabled = false,
  label = 'Sale amount keypad',
  className,
}: NumericKeypadProps) {
  const press = useCallback(
    (key: string) => {
      if (disabled) return
      if (key === 'back') {
        onChange(removeDigit(value))
        return
      }
      if (key === '00') {
        onChange(appendDigit(appendDigit(value, 0), 0))
        return
      }
      onChange(appendDigit(value, Number(key)))
    },
    [disabled, onChange, value],
  )

  useEffect(() => {
    if (!captureKeyboard || disabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Never steal keys from a real text field (the note input, for example).
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        press(event.key)
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        press('back')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [captureKeyboard, disabled, press])

  return (
    <div className={`keypad${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {DIGITS.map((d) => (
        <button
          key={d}
          type="button"
          className="keypad__key"
          onClick={() => press(d)}
          disabled={disabled}
          aria-label={d}
        >
          {d}
        </button>
      ))}

      {showDoubleZero ? (
        <button
          type="button"
          className="keypad__key"
          onClick={() => press('00')}
          disabled={disabled}
          aria-label="Double zero"
        >
          00
        </button>
      ) : (
        <span />
      )}

      <button
        type="button"
        className={`keypad__key${showDoubleZero ? '' : ' keypad__key--wide'}`}
        onClick={() => press('0')}
        disabled={disabled}
        aria-label="0"
      >
        0
      </button>

      <button
        type="button"
        className="keypad__key keypad__key--action"
        onClick={() => press('back')}
        disabled={disabled || value === 0}
        aria-label="Delete last digit"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M12 9.5 17 15M17 9.5 12 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}

export interface KeypadDisplayProps {
  /**
   * The already-formatted amount, e.g. "389.00". Format it with
   * src/core/format.ts — this component never does money formatting.
   */
  formatted: string
  /** Currency symbol or code shown small and leading. */
  symbol?: string
  /** Renders the figure greyed and shows a caret. */
  empty?: boolean
  /** Accessible sentence, e.g. "Sale amount, 389 dollars". */
  ariaLabel?: string
}

/** The hero figure above the keypad. Uses the --num-hero ramp (§50). */
export function KeypadDisplay({
  formatted,
  symbol = '$',
  empty = false,
  ariaLabel,
}: KeypadDisplayProps) {
  // The live region carries real TEXT. Previously every child was aria-hidden
  // and the only wording lived in aria-label, so the region had no content to
  // announce and screen readers stayed silent as digits were typed.
  return (
    <div className={`keypad-display${empty ? ' keypad-display--empty' : ''}`}>
      <span className="keypad-display__currency" aria-hidden="true">
        {symbol}
      </span>
      <span className="keypad-display__amount" aria-hidden="true">
        {formatted}
      </span>
      {empty && <span className="keypad-display__caret" aria-hidden="true" />}
      <span className="sr-only" role="status" aria-live="polite">
        {ariaLabel ?? `Sale amount ${symbol}${formatted}`}
      </span>
    </div>
  )
}

export default NumericKeypad

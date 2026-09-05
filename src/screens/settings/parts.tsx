/**
 * Settings — small shared building blocks.
 *
 * Deliberately thin: anything here that turned out to be genuinely reusable
 * across screens belongs in @/components, not in this folder. These exist only
 * because Settings is the one screen made almost entirely of form controls,
 * and the design system has no field/toggle primitive.
 */
import { useId, type ReactNode } from 'react'
import { PageHeader } from '@/components'
import { ROUTES, useNavigate } from '@/app/router'

/* Value plumbing lives in ./values so it can be tested without React, and so
   there is one parser per concept rather than one per screen. Re-exported here
   because every Settings screen already imports its form pieces from './parts'. */
export {
  MAX_RATE_BASIS_POINTS,
  basisPointsToInput,
  centsToInput,
  parseMoneyInput,
  parsePercent,
  parsePercentInput,
  percentRejectionMessage,
} from './values'
export type { PercentRejection, PercentResult } from './values'

/* ------------------------------------------------------------------ page */

export interface SettingsPageProps {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  /** Shows "Saved on this device" under the title. */
  storedLocally?: boolean
}

/**
 * The frame every Settings sub-screen shares: a back affordance to the
 * Settings index and a vertical stack of cards.
 */
export function SettingsPage({ title, subtitle, children, storedLocally }: SettingsPageProps) {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        showStoredLocally={storedLocally}
        onBack={() => navigate(ROUTES.settings)}
        backLabel="Back to Settings"
      />
      <div className="shell-stack">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ prose */

export function Note({
  children,
  quiet = false,
}: {
  children: ReactNode
  quiet?: boolean
}) {
  return <p className={`set-note${quiet ? ' set-note--quiet' : ''}`}>{children}</p>
}

/** Inline validation message. Carries a glyph so it is not colour alone (§63). */
export function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p className="set-error" id={id} role="alert">
      <span className="set-error__glyph" aria-hidden="true">
        !
      </span>
      <span>{children}</span>
    </p>
  )
}

/* ------------------------------------------------------------------- rows */

export function Row({
  label,
  sub,
  control,
}: {
  label: ReactNode
  sub?: ReactNode
  control: ReactNode
}) {
  return (
    <div className="set-row">
      <div className="set-row__text">
        <div className="set-row__label">{label}</div>
        {sub && <div className="set-row__sub">{sub}</div>}
      </div>
      <div className="set-row__control">{control}</div>
    </div>
  )
}

/** Read-only key/value line — Local Storage (§42) and About. */
export function KeyValue({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="set-kv">
      <span className="set-kv__key">{label}</span>
      <span className="set-kv__value">{value}</span>
    </div>
  )
}

/* ----------------------------------------------------------------- toggle */

export interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  /** Accessible name. Required — the switch has no visible text of its own. */
  label: string
  disabled?: boolean
}

/**
 * On/off switch. State is signalled three ways: aria-checked, knob position,
 * and the literal word "On"/"Off" — never the tint alone.
 */
export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="set-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="set-toggle__word" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
      <span className="set-toggle__track" aria-hidden="true">
        <span className="set-toggle__knob" />
      </span>
    </button>
  )
}

/* ----------------------------------------------------------------- fields */

export interface TextFieldProps {
  label: ReactNode
  value: string
  onChange: (next: string) => void
  placeholder?: string
  /** Leading affix, e.g. "$". */
  prefix?: ReactNode
  /** Trailing affix, e.g. "%". */
  suffix?: ReactNode
  error?: string | null
  hint?: ReactNode
  inputMode?: 'text' | 'decimal' | 'numeric'
  type?: 'text' | 'date'
  numeric?: boolean
  maxLength?: number
  /**
   * Announce the field as mandatory. aria-required only - the native attribute
   * would hand these fields to the browser's own validation bubble, which is
   * not how this product reports errors.
   */
  required?: boolean
  className?: string
  onEnter?: () => void
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  error,
  hint,
  inputMode = 'text',
  type = 'text',
  numeric = false,
  maxLength,
  required = false,
  className,
  onEnter,
}: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')

  return (
    <div className={`set-field${className ? ` ${className}` : ''}`}>
      <label className="set-field__label" htmlFor={id}>
        {label}
      </label>
      <div className={`set-inputwrap${error ? ' set-inputwrap--invalid' : ''}`}>
        {prefix && (
          <span className="set-inputwrap__affix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={id}
          className={`set-input${numeric ? ' set-input--numeric' : ''}`}
          type={type}
          value={value}
          inputMode={inputMode}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) {
              e.preventDefault()
              onEnter()
            }
          }}
        />
        {suffix && (
          <span className="set-inputwrap__affix" aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p className="set-note set-note--quiet" id={hintId}>
          {hint}
        </p>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  )
}

/* ------------------------------------------------------------------ icons */

export function ChevronRight() {
  return (
    <svg className="set-nav__chevron" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="m7.5 4.5 5.5 5.5-5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ArrowUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 16V4m0 0L5 9m5-5 5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ArrowDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 4v12m0 0 5-5m-5 5-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M13.4 3.6a1.7 1.7 0 0 1 2.4 2.4L7.4 14.4 4 15.4l1-3.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CrossIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="m4 4 8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

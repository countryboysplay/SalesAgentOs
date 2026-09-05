import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode
  variant?: ButtonVariant
  /**
   * 'md' (44px) and 'lg' (54px) meet the touch-target floor on their own.
   * 'sm' (34px) is only safe inside a row that is already 44px tall.
   */
  size?: ButtonSize
  /** Full width. Use for the primary action at the foot of a sheet. */
  block?: boolean
  /** Leading icon node (an inline <svg> or emoji span). */
  icon?: ReactNode
  /** Trailing icon node. */
  iconRight?: ReactNode
  /** Shows a spinner and disables the button. Local writes never need this. */
  loading?: boolean
  /** Required when there are no visible children (icon-only button). */
  ariaLabel?: string
  /** React 19 accepts ref as a plain prop on function components. */
  ref?: Ref<HTMLButtonElement>
}

/**
 * Button — the only clickable control primitive.
 *
 * Copy rule (§62): never label a button Sync / Connect / Upload to cloud.
 * Use Save, Record Sale, Create Backup, Restore Backup.
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  block = false,
  icon,
  iconRight,
  loading = false,
  ariaLabel,
  className,
  disabled,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const iconOnly = !children && (Boolean(icon) || Boolean(iconRight))

  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    block ? 'btn--block' : '',
    iconOnly ? 'btn--icon-only' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="btn__spinner" aria-hidden="true" />
      ) : icon ? (
        <span className="btn__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
      {iconRight && !loading ? (
        <span className="btn__icon" aria-hidden="true">
          {iconRight}
        </span>
      ) : null}
    </button>
  )
}

export default Button

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import './SegmentedControl.css'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  /** Accessible name when `label` is an abbreviation such as "7D". */
  ariaLabel?: string
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>
  value: T
  onChange: (value: T) => void
  /**
   * 'radio' (default) for a value picker such as 7D/30D/90D/Year/All.
   * 'tabs' when the control switches the whole panel below it, such as the
   * Day/Month/Year/All ledger tabs — pair with `controlsId`.
   */
  role?: 'radio' | 'tabs'
  /** id of the panel a tabs-role control governs. */
  controlsId?: string
  /** Group label for assistive tech, e.g. "Date range". */
  label: string
  size?: 'md' | 'lg'
  /** Hug the labels instead of filling the available width. */
  auto?: boolean
  className?: string
}

/**
 * SegmentedControl — a single-choice control rendered as one connected strip.
 *
 * Roving arrow-key navigation (Left/Right/Home/End) selects as it moves,
 * which is the expected behaviour for both radio groups and automatic tabs.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  role = 'radio',
  controlsId,
  label,
  size = 'md',
  auto = false,
  className,
}: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null)
  const isTabs = role === 'tabs'

  // tabIndex roves on the selected option, so a selection change that does not
  // also move focus strands the user on a tabIndex={-1} element.
  const selectAndFocus = (next: SegmentOption<T> | undefined) => {
    if (!next) return
    onChange(next.value)
    const node = ref.current?.querySelector<HTMLButtonElement>(
      `[data-segment-value="${CSS.escape(next.value)}"]`,
    )
    node?.focus()
  }

  const move = (delta: number) => {
    const enabled = options.filter((o) => !o.disabled)
    if (enabled.length === 0) return
    const current = enabled.findIndex((o) => o.value === value)
    selectAndFocus(enabled[(current + delta + enabled.length) % enabled.length])
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Home': {
        event.preventDefault()
        selectAndFocus(options.find((o) => !o.disabled))
        break
      }
      case 'End': {
        event.preventDefault()
        selectAndFocus([...options].reverse().find((o) => !o.disabled))
        break
      }
      default:
        break
    }
  }

  return (
    <div
      ref={ref}
      className={[
        'segmented',
        `segmented--${size}`,
        auto ? 'segmented--auto' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={isTabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            data-segment-value={option.value}
            className="segmented__option focus-inset"
            role={isTabs ? 'tab' : 'radio'}
            {...(isTabs
              ? { 'aria-selected': selected, 'aria-controls': controlsId }
              : { 'aria-checked': selected })}
            aria-label={option.ariaLabel}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default SegmentedControl

/**
 * PeriodStepper — the `< September 4 >` control at the top of Day, Month and
 * Year (§20, §21, §24), plus the jump back to the current period.
 */
import { Button } from '@/components'

const ChevronLeft = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </svg>
)

const ChevronRight = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7.5 4.5 13 10l-5.5 5.5" />
  </svg>
)

export interface PeriodStepperProps {
  label: string
  /** Small uppercase line under the label, e.g. the year. */
  sub?: string
  previousLabel: string
  nextLabel: string
  onPrevious: () => void
  onNext: () => void
  /** Disabled once the period would run past the current one. */
  nextDisabled?: boolean
  /** "Today" / "This month" / "This year". Hidden when already there. */
  jumpLabel?: string
  onJump?: () => void
}

export function PeriodStepper({
  label,
  sub,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  nextDisabled = false,
  jumpLabel,
  onJump,
}: PeriodStepperProps) {
  return (
    <div>
      <div className="stepper">
        <Button variant="ghost" size="md" ariaLabel={previousLabel} onClick={onPrevious} icon={<ChevronLeft />} />
        <h2 className="stepper__label">
          {label}
          {sub ? <span className="stepper__sub">{sub}</span> : null}
        </h2>
        <Button
          variant="ghost"
          size="md"
          ariaLabel={nextLabel}
          onClick={onNext}
          disabled={nextDisabled}
          icon={<ChevronRight />}
        />
      </div>
      {jumpLabel && onJump ? (
        <div className="stepper__today">
          <Button variant="ghost" size="md" onClick={onJump}>
            {jumpLabel}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default PeriodStepper

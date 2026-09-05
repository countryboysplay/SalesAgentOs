import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import './Celebration.css'

/** Occasions worth a celebration. Spec §53. A plain sale is NOT one of them. */
export type CelebrationReason =
  | 'daily-goal'
  | 'monthly-goal'
  | 'annual-goal'
  | 'personal-record'

const PIECE_COUNT = 22

const CONFETTI_COLORS = [
  'var(--accent)',
  'var(--positive)',
  'var(--warning)',
  'var(--chart-series-4)',
]

export interface CelebrationProps {
  /**
   * Flip to true to fire the burst once. The component resets itself when the
   * animation completes and calls onComplete.
   *
   * Guard this with useOneShot() — see below — so a goal that is still met
   * on every subsequent render does not re-fire.
   */
  active: boolean
  onComplete?: () => void
  /** Milliseconds the burst lasts. Default 1100. Keep it short (§53). */
  duration?: number
  /**
   * Forces the reduced-motion presentation regardless of OS preference.
   * Pass Settings.reducedMotion === true.
   */
  forceReducedMotion?: boolean
  /** Announced to screen readers, e.g. "Monthly goal reached". */
  announcement?: string
}

function prefersReducedMotion(): boolean {
  // Settings.reducedMotion writes data-reduced-motion on <html> (store.tsx).
  // Reading it here means the burst is suppressed even when a caller forgets
  // to pass forceReducedMotion - §63 is a floor, not an opt-in.
  if (typeof document !== 'undefined') {
    if (document.documentElement.dataset.reducedMotion === 'true') return true
  }
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Celebration — a brief confetti burst.
 *
 * Deliberately small: no full-screen takeover, no sound, no blocking layer.
 * It is pointer-events:none, so the agent can keep working straight through it.
 */
export function Celebration({
  active,
  onComplete,
  duration = 1100,
  forceReducedMotion = false,
  announcement,
}: CelebrationProps) {
  const [visible, setVisible] = useState(false)
  const doneRef = useRef(onComplete)
  doneRef.current = onComplete

  const reduced = forceReducedMotion || prefersReducedMotion()

  // `active` is a pulse, not a latch: it may fall back to false before the
  // burst finishes. Rising-edge detection plus an unmount-only cleanup means
  // the animation always runs to completion.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!active) {
      startedRef.current = false
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    setVisible(true)

    // Haptic nudge where supported (§53). Silently ignored elsewhere.
    if (!reduced && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(18)
      } catch {
        /* vibration is a nicety, never a requirement */
      }
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => {
        setVisible(false)
        doneRef.current?.()
      },
      reduced ? 700 : duration + 150,
    )
  }, [active, duration, reduced])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => {
        // Deterministic spread, so the burst looks designed rather than random.
        const angle = (i / PIECE_COUNT) * Math.PI * 2 + (i % 3) * 0.19
        const distance = 110 + ((i * 37) % 90)
        const style: CSSProperties = {
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          ['--confetti-x' as string]: `${Math.cos(angle) * distance}px`,
          ['--confetti-y' as string]: `${Math.sin(angle) * distance - 40}px`,
          ['--confetti-rot' as string]: `${(i % 2 ? 1 : -1) * (160 + i * 11)}deg`,
          ['--confetti-delay' as string]: `${(i % 6) * 26}ms`,
          ['--confetti-duration' as string]: `${duration}ms`,
        }
        return style
      }),
    [duration],
  )

  if (typeof document === 'undefined') return null

  // The announcement lives OUTSIDE the aria-hidden burst. aria-hidden="true"
  // on an ancestor removes the whole subtree from the accessibility tree and a
  // descendant aria-hidden="false" cannot undo it, so the previous placement
  // meant no screen reader ever heard "Daily goal reached".
  //
  // The live region is also mounted permanently and filled later, rather than
  // inserted with its text already in place - the latter is unreliable in
  // JAWS and NVDA.
  return createPortal(
    <>
      {visible && (
        <div className={`celebration${reduced ? ' celebration--reduced' : ''}`} aria-hidden="true">
          <span className="celebration__pulse" />
          {!reduced &&
            pieces.map((style, i) => (
              <span key={i} className="celebration__piece" style={style} />
            ))}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {visible && announcement ? announcement : ''}
      </span>
    </>,
    document.body,
  )
}

/**
 * Keys already celebrated in this session.
 *
 * Module scope, deliberately: a useRef Set is per MOUNT, and HomeScreen
 * unmounts on every navigation, so the daily burst replayed on every return to
 * Home. "Remembered for the session" has to outlive the component (§53).
 */
const SEEN_ONE_SHOTS = new Set<string>()

/**
 * useOneShot — the guard that stops a celebration firing on every render.
 *
 * Spec §53 is explicit: do NOT celebrate after every sale. A goal, once
 * reached, stays reached for the rest of the day, so a naive
 * `active={progress >= 1}` would re-fire on every keystroke.
 *
 * Pass a key that changes only when a NEW achievement happens:
 *
 *   const fire = useOneShot(pace.status === 'goal-reached', `daily:${today}`)
 *   <Celebration active={fire} announcement="Daily goal reached" />
 *
 * The key is remembered for the lifetime of the session, so re-entering the
 * Home screen does not re-fire it. Persist across launches by seeding
 * `seen` from settings if a screen team needs that.
 */
export function useOneShot(condition: boolean, key: string): boolean {
  const [fired, setFired] = useState(false)

  useEffect(() => {
    if (!condition || SEEN_ONE_SHOTS.has(key)) {
      setFired(false)
      return
    }
    SEEN_ONE_SHOTS.add(key)
    setFired(true)
    // Auto-lower so `active` is a pulse, not a latched flag.
    const t = setTimeout(() => setFired(false), 60)
    return () => clearTimeout(t)
  }, [condition, key])

  return fired
}

export default Celebration

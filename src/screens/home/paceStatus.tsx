/**
 * Performance-state presentation — spec §52, §63.
 *
 * One place decides how a PaceStatus reads, so the score card, the pace card
 * and the sales list can never drift apart. Every status carries a WORD and a
 * GLYPH as well as a colour: colour is never the only signal (§63).
 *
 * Tone mapping follows docs/DESIGN-SYSTEM.md: ahead / goal-reached -> positive,
 * on-track -> accent, behind -> warning (restrained, never alarm), no-goal ->
 * neutral. Negative is reserved for cancellations and destructive actions.
 */
import type { PaceStatus } from '@/core/types'

export type StatusTone = 'accent' | 'positive' | 'warning' | 'neutral'

const TONES: Record<PaceStatus, StatusTone> = {
  ahead: 'positive',
  'goal-reached': 'positive',
  'on-track': 'accent',
  behind: 'warning',
  'no-goal': 'neutral',
}

/** Short, never shame-oriented (§52). */
const WORDS: Record<PaceStatus, string> = {
  ahead: 'Ahead of pace',
  'goal-reached': 'Goal reached',
  'on-track': 'On track',
  behind: 'Behind pace',
  'no-goal': 'No goal set',
}

export function paceTone(status: PaceStatus): StatusTone {
  return TONES[status]
}

export function paceWord(status: PaceStatus): string {
  return WORDS[status]
}

const PATHS: Record<PaceStatus, string> = {
  // Arrow up.
  ahead: 'M8 12.5V3.5M4.5 7 8 3.5 11.5 7',
  // Filled-in tick.
  'goal-reached': 'M3 8.4l3.4 3.4L13 5.2',
  // Level line.
  'on-track': 'M3.5 8h9',
  // Arrow down — deliberately the same weight as the up arrow, not a warning
  // triangle: §52 asks for restraint, not alarm.
  behind: 'M8 3.5v9M4.5 9 8 12.5 11.5 9',
  // Small dash.
  'no-goal': 'M5 8h6',
}

/**
 * The glyph that pairs with the status colour. Decorative: the surrounding
 * markup always states the status in words too.
 */
export function PaceGlyph({ status, className }: { status: PaceStatus; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[status]} />
    </svg>
  )
}

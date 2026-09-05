/**
 * Status glyphs for the Insights screen.
 *
 * These exist so pace and streak states are legible without colour (§63): the
 * arrow, the dash, the tick and the spark carry the meaning on their own, and
 * the word beside them says it again in plain English.
 */

interface GlyphProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 20 20',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
})

/** Ahead of pace. */
export function AheadIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...base(size)}>
      <path d="M10 15.5V5" />
      <path d="M5.5 9.5 10 5l4.5 4.5" />
    </svg>
  )
}

/** On track — deliberately a level line, not an arrow. */
export function OnTrackIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 10h12" />
    </svg>
  )
}

/** Behind pace. Restrained: the same arrow, pointing down (§52). */
export function BehindIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...base(size)}>
      <path d="M10 4.5V15" />
      <path d="M5.5 10.5 10 15l4.5-4.5" />
    </svg>
  )
}

/** Goal reached. */
export function ReachedIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...base(size)}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  )
}

/** No goal in force — neutral, never a warning. */
export function NoGoalIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...base(size)}>
      <circle cx="10" cy="10" r="6.5" strokeWidth="1.8" />
      <path d="M10 6.75v3.5" />
      <path d="M10 13.25h.01" />
    </svg>
  )
}

/** Streak. */
export function StreakIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...base(size)}>
      <path d="M10 2.5s4.5 3.4 4.5 7.4a4.5 4.5 0 0 1-9 0c0-1.6.7-3 1.6-4.1.3 1.1 1 1.9 1.8 1.9 1 0 1.4-1 1.1-5.2Z" />
    </svg>
  )
}

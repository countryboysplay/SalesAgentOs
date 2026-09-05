/**
 * "Today", kept honest while the screen stays open.
 *
 * Insights reads `todayIso()` once per render, and an installed PWA is often
 * left open for days — a phone that is simply unlocked at 8am would otherwise
 * still be showing "Last 30 days" ending on a date two days ago, with today's
 * sales falling outside every range on the screen.
 *
 * Two triggers, because neither alone is enough: a timer set for the next local
 * midnight (which a backgrounded tab may have throttled or never run), and
 * `visibilitychange`, which fires the moment the agent comes back to the app.
 * Both re-read `todayIso()` rather than incrementing anything, so a device
 * whose clock or time zone moved lands on the right day either way.
 *
 * Scoped to this screen deliberately: Home owns the same problem on its own
 * screen and is fixing it there.
 */
import { useEffect, useState } from 'react'
import { todayIso } from '@/core/date'
import type { IsoDate } from '@/core/types'

/** Milliseconds until just after the next local midnight. */
function msUntilNextMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0)
  // A clock that jumped backwards must not schedule a zero-delay spin.
  return Math.max(1_000, next.getTime() - now.getTime())
}

export function useToday(): IsoDate {
  const [today, setToday] = useState<IsoDate>(todayIso)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    // State only changes on a real date change, so a wake-up on the same day
    // costs one string comparison and no re-render.
    const refresh = () => setToday((previous) => (todayIso() === previous ? previous : todayIso()))

    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        refresh()
        schedule()
      }, msUntilNextMidnight())
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      refresh()
      schedule()
    }

    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return today
}

/**
 * Settings > Goals — the timeline sentences.
 *
 * Two regressions are pinned here:
 *
 *  1. The screen used to resolve "in force now" with its own bare interval test
 *     and a comparator that returned 0 on equal `effectiveFrom`. Two rows could
 *     both be marked current, and the timeline could contradict every other
 *     screen, which resolves through `@/core/calc`.
 *  2. The end month of a closed interval was formatted without the user's
 *     locale, so a French user read "janvier 2026 – August 2026".
 */
import { describe, expect, it } from 'vitest'

import type { FormatSettings } from '@/core/format'
import type { Goal, GoalType } from '@/core/types'
import { goalCoveringDate, goalHistory, goalPeriodLabel } from './goalHistory'

const enUS: FormatSettings = { currency: 'USD', locale: 'en-US' }
const frFR: FormatSettings = { currency: 'EUR', locale: 'fr-FR' }

function goal(overrides: Partial<Goal> & Pick<Goal, 'id' | 'effectiveFrom'>): Goal {
  return {
    type: 'monthly',
    amount: 900_000,
    effectiveTo: null,
    enabled: true,
    createdAt: 1_000,
    ...overrides,
  }
}

const MONTHLY: GoalType = 'monthly'

describe('which row is in force', () => {
  it('marks exactly one row current, even when two intervals overlap', () => {
    // A stale row left open plus the row that superseded it. A bare interval
    // test says both cover today; only the later one is actually in force.
    const rows = [
      goal({ id: 'old', effectiveFrom: '2026-01-01', amount: 900_000 }),
      goal({ id: 'new', effectiveFrom: '2026-09-01', amount: 1_000_000 }),
    ]

    const entries = goalHistory(rows, MONTHLY, '2026-09-04', enUS)
    expect(entries.filter((e) => e.current).map((e) => e.key)).toEqual(['new'])
  })

  it('breaks a same-day tie the way the rest of the app does', () => {
    // Same effectiveFrom: the later createdAt is the correction that won.
    const rows = [
      goal({ id: 'first', effectiveFrom: '2026-09-04', amount: 900_000, createdAt: 1 }),
      goal({ id: 'second', effectiveFrom: '2026-09-04', amount: 1_000_000, createdAt: 2 }),
    ]

    const entries = goalHistory(rows, MONTHLY, '2026-09-04', enUS)
    expect(entries.filter((e) => e.current).map((e) => e.key)).toEqual(['second'])
    // Newest first, so the winner is also the row at the top of the timeline.
    expect(entries[0]?.key).toBe('second')
  })

  it('still names the window when the goal has been switched off', () => {
    const rows = [
      goal({ id: 'on', effectiveFrom: '2026-01-01', effectiveTo: '2026-08-31' }),
      goal({ id: 'off', effectiveFrom: '2026-09-01', enabled: false }),
    ]

    const entries = goalHistory(rows, MONTHLY, '2026-09-04', enUS)
    expect(entries.filter((e) => e.current).map((e) => e.key)).toEqual(['off'])
    expect(entries.find((e) => e.key === 'off')?.amount).toBe('No goal')
    // goalFor hides a disabled winner, because "no goal from here" is what it
    // means — the timeline still has to say which window we are standing in.
    expect(goalCoveringDate(MONTHLY, rows, '2026-09-04')?.id).toBe('off')
  })

  it('marks nothing current when no interval covers the date', () => {
    const rows = [goal({ id: 'later', effectiveFrom: '2026-10-01' })]
    expect(goalHistory(rows, MONTHLY, '2026-09-04', enUS).some((e) => e.current)).toBe(false)
  })

  it('ignores rows belonging to another goal type', () => {
    const rows = [
      goal({ id: 'monthly', effectiveFrom: '2026-01-01' }),
      goal({ id: 'annual', type: 'annual', effectiveFrom: '2026-09-01' }),
    ]
    const entries = goalHistory(rows, MONTHLY, '2026-09-04', enUS)
    expect(entries.map((e) => e.key)).toEqual(['monthly'])
  })
})

describe('period labels', () => {
  const closed = goal({
    id: 'closed',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-08-31',
  })

  it('renders BOTH months in the user locale', () => {
    expect(goalPeriodLabel(closed, MONTHLY, frFR)).toBe('janvier 2026 – août 2026')
  })

  it('renders an en-US range unchanged', () => {
    expect(goalPeriodLabel(closed, MONTHLY, enUS)).toBe('January 2026 – August 2026')
  })

  it('says "onward" for the open interval', () => {
    expect(goalPeriodLabel(goal({ id: 'open', effectiveFrom: '2026-09-01' }), MONTHLY, enUS)).toBe(
      'September 2026 onward',
    )
  })

  it('falls back to dates when the interval does not align to whole months', () => {
    const midMonth = goal({ id: 'mid', effectiveFrom: '2026-09-04' })
    expect(goalPeriodLabel(midMonth, MONTHLY, enUS)).toContain('September 4, 2026')
  })
})

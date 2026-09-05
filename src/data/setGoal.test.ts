/**
 * `setGoal(type, amount, from)` means "from this date onward, the goal is X".
 *
 * A row starting LATER than `from` used to be preserved, bounding the new row
 * into an island: restating September's goal from the 1st, when onboarding had
 * stamped a row on the 4th, produced a 3-day goal and left the OLD amount in
 * force from the 4th onward forever — while the UI toast claimed the new one
 * applied "from September 1 onward".
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeDatabase, destroyDatabase } from './db'
import { listGoals, setGoal } from './repository'
import { goalAmountFor, goalAmountForPeriod } from '../core/calc'

beforeEach(async () => {
  await destroyDatabase()
})

afterEach(async () => {
  await closeDatabase()
})

describe('setGoal', () => {
  it('supersedes a later row rather than being bounded by it', async () => {
    // Onboarded on the 4th.
    await setGoal('monthly', 3_000_000, '2026-09-04')
    // Then restated from the start of the month on the 10th.
    await setGoal('monthly', 4_000_000, '2026-09-01')

    const goals = await listGoals()
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({
      amount: 4_000_000,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    })

    // The new goal is in force for the rest of the month and beyond.
    expect(goalAmountFor('monthly', '2026-09-04', goals)).toBe(4_000_000)
    expect(goalAmountFor('monthly', '2026-10-01', goals)).toBe(4_000_000)
    expect(goalAmountFor('monthly', '2026-12-31', goals)).toBe(4_000_000)
  })

  it('closes the previous row the day before, never on the same day', async () => {
    await setGoal('monthly', 800_000, '2026-01-01')
    await setGoal('monthly', 1_000_000, '2026-09-01')

    const goals = await listGoals()
    const january = goals.find((g) => g.effectiveFrom === '2026-01-01')
    expect(january?.effectiveTo).toBe('2026-08-31')

    // §77 Goal Change Test: January keeps the goal it was measured against.
    expect(goalAmountForPeriod('monthly', '2026-01-01', '2026-01-31', goals)).toBe(800_000)
    expect(goalAmountForPeriod('monthly', '2026-09-01', '2026-09-30', goals)).toBe(1_000_000)
  })

  it('treats a second save on the same day as a correction, not a new row', async () => {
    await setGoal('monthly', 1_000_000, '2026-09-04')
    await setGoal('monthly', 1_200_000, '2026-09-04')

    const goals = await listGoals()
    expect(goals).toHaveLength(1)
    expect(goals[0].amount).toBe(1_200_000)
  })

  it('leaves exactly one row in force at any date', async () => {
    await setGoal('monthly', 800_000, '2026-01-01')
    await setGoal('monthly', 900_000, '2026-05-01')
    await setGoal('monthly', 1_000_000, '2026-09-01')

    const goals = await listGoals()
    for (const date of ['2026-01-01', '2026-04-30', '2026-05-01', '2026-08-31', '2026-09-01', '2027-06-01']) {
      const inForce = goals.filter(
        (g) => g.effectiveFrom <= date && (g.effectiveTo === null || g.effectiveTo >= date),
      )
      expect(inForce, `overlapping rows on ${date}`).toHaveLength(1)
    }
  })
})

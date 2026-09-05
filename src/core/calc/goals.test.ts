import { goalAmountFor, goalFor, goalHistory, hasGoal } from './goals'
import { makeGoal } from './fixtures'

const monthlyEarly = makeGoal({
  type: 'monthly',
  amount: 900_000,
  effectiveFrom: '2026-01-01',
  effectiveTo: '2026-08-31',
  createdAt: 1,
})
const monthlyLate = makeGoal({
  type: 'monthly',
  amount: 1_000_000,
  effectiveFrom: '2026-09-01',
  effectiveTo: null,
  createdAt: 2,
})
const daily = makeGoal({ type: 'daily', amount: 50_000, effectiveFrom: '2026-01-01' })

const goals = [monthlyEarly, monthlyLate, daily]

describe('goalFor', () => {
  it('resolves the version in force on the date (spec §32)', () => {
    expect(goalFor('monthly', '2026-08-31', goals)?.amount).toBe(900_000)
    expect(goalFor('monthly', '2026-09-01', goals)?.amount).toBe(1_000_000)
    expect(goalFor('monthly', '2027-05-01', goals)?.amount).toBe(1_000_000)
  })

  it('is inclusive on both ends of the window', () => {
    expect(goalFor('monthly', '2026-01-01', goals)?.id).toBe(monthlyEarly.id)
    expect(goalFor('monthly', '2026-08-31', goals)?.id).toBe(monthlyEarly.id)
    expect(goalFor('monthly', '2025-12-31', goals)).toBeNull()
  })

  it('does not leak across goal types', () => {
    expect(goalFor('daily', '2026-09-04', goals)?.amount).toBe(50_000)
    expect(goalFor('annual', '2026-09-04', goals)).toBeNull()
    expect(hasGoal('annual', '2026-09-04', goals)).toBe(false)
  })

  it('prefers the latest effectiveFrom when windows overlap', () => {
    const openEnded = makeGoal({
      type: 'annual',
      amount: 10_000_000,
      effectiveFrom: '2026-01-01',
      createdAt: 1,
    })
    const raised = makeGoal({
      type: 'annual',
      amount: 12_000_000,
      effectiveFrom: '2026-06-01',
      createdAt: 2,
    })
    const overlapping = [openEnded, raised]
    expect(goalFor('annual', '2026-05-31', overlapping)?.amount).toBe(10_000_000)
    expect(goalFor('annual', '2026-06-01', overlapping)?.amount).toBe(12_000_000)
  })

  it('breaks same-day ties on createdAt, so the result is stable', () => {
    const first = makeGoal({
      type: 'daily',
      amount: 40_000,
      effectiveFrom: '2026-02-01',
      createdAt: 10,
    })
    const corrected = makeGoal({
      type: 'daily',
      amount: 60_000,
      effectiveFrom: '2026-02-01',
      createdAt: 20,
    })
    expect(goalFor('daily', '2026-02-05', [first, corrected])?.amount).toBe(60_000)
    expect(goalFor('daily', '2026-02-05', [corrected, first])?.amount).toBe(60_000)
  })

  it('treats a disabled current version as no goal, without resurrecting the old one', () => {
    const switchedOff = makeGoal({
      type: 'monthly',
      amount: 1_000_000,
      effectiveFrom: '2026-10-01',
      enabled: false,
      createdAt: 3,
    })
    const withOff = [...goals, switchedOff]
    expect(goalFor('monthly', '2026-09-15', withOff)?.amount).toBe(1_000_000)
    expect(goalFor('monthly', '2026-10-15', withOff)).toBeNull()
    expect(goalAmountFor('monthly', '2026-10-15', withOff)).toBeNull()
  })

  it('returns null for an empty goal list', () => {
    expect(goalFor('daily', '2026-09-04', [])).toBeNull()
    expect(goalAmountFor('daily', '2026-09-04', [])).toBeNull()
  })
})

describe('goalHistory', () => {
  it('lists one type newest first', () => {
    expect(goalHistory('monthly', goals).map((goal) => goal.amount)).toEqual([
      1_000_000, 900_000,
    ])
    expect(goalHistory('annual', goals)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  BoardDataError,
  executiveFocus,
  findAgent,
  leaderboard,
  parseGsr,
  parseScoreboard,
} from './boards'

/* Shapes copied from the Apps Script getDashboardData() functions. */

const scoreboardJson = {
  ok: true,
  generatedAt: '2026-10-01T15:00:05.000Z',
  lastUpdated: '2026-10-01T15:00:00.000Z',
  agents: [
    { rank: 2, name: 'Sam Rivera', yesCount: 3, yesDollars: 1049.1 },
    { rank: 1, name: '  Jonathan Lindsay ', yesCount: 4, yesDollars: 1210.555 },
    { rank: 3, name: '', yesCount: 9, yesDollars: 9 },
  ],
  totals: { activeAgents: 99, yesCount: 99, yesDollars: 99 },
}

const branch = (name: string, total: number, budget: number) => ({
  branch: name,
  totalActual: total, totalBudget: budget, totalAttainment: total / budget, totalRemaining: budget - total,
  faoActual: total * 0.6, faoBudget: budget * 0.6,
  pgcActual: total * 0.4, pgcBudget: budget * 0.4,
})

const gsrJson = {
  ok: true,
  generatedAt: '2026-10-01T14:55:00.000Z',
  current: {
    branches: [branch('BOWL', 900_000, 1_000_000), branch('PAD', 400_000, 800_000), branch('OWEN', 820_000, 800_000)],
    totals: { totalActual: 2_120_000, totalBudget: 2_600_000, faoActual: 1_272_000, faoBudget: 1_560_000, pgcActual: 848_000, pgcBudget: 1_040_000 },
  },
  history: [
    { timestamp: '2026-09-30T12:00:00.000Z', totalAttainment: 0.79, faoAttainment: 0.8, pgcAttainment: 0.77 },
    { timestamp: 'not a date', totalAttainment: 0.5 },
  ],
}

describe('parseScoreboard', () => {
  it('converts dollars to integer cents and orders by rank', () => {
    const board = parseScoreboard(scoreboardJson)
    expect(board.agents.map((a) => a.name)).toEqual(['Jonathan Lindsay', 'Sam Rivera'])
    expect(board.agents[0]!.yesCents).toBe(121056)
    expect(Number.isInteger(board.agents[1]!.yesCents)).toBe(true)
  })

  it('recomputes totals from the rows', () => {
    expect(parseScoreboard(scoreboardJson).totals).toEqual({ activeAgents: 2, yesCount: 7, yesCents: 225966 })
  })

  it('handles an empty board', () => {
    const board = parseScoreboard({ ok: true, agents: [], lastUpdated: null })
    expect(board.totals.activeAgents).toBe(0)
    expect(board.lastUpdated).toBeNull()
  })

  it('rejects feed errors and bad shapes', () => {
    expect(() => parseScoreboard({ ok: false, error: 'boom' })).toThrow(BoardDataError)
    expect(() => parseScoreboard({ ok: true })).toThrow(/agents/)
    expect(() => parseScoreboard({ ok: true, agents: [{ name: 'A', yesDollars: 'lots' }] })).toThrow(/yesDollars/)
  })

  it('finds the agent row regardless of case and spacing', () => {
    const board = parseScoreboard(scoreboardJson)
    expect(findAgent(board, 'jonathan  lindsay')?.rank).toBe(1)
    expect(findAgent(board, '')).toBeNull()
    expect(findAgent(board, 'Nobody')).toBeNull()
  })
})

describe('parseGsr', () => {
  it('converts every figure to cents and derives attainment from cents', () => {
    const gsr = parseGsr(gsrJson)
    expect(gsr.branches).toHaveLength(3)
    expect(gsr.totals.total.actualCents).toBe(212_000_000)
    expect(gsr.totals.total.remainingCents).toBe(48_000_000)
    expect(gsr.branches[2]!.total.remainingCents).toBe(0) // over budget never goes negative
    expect(gsr.branches[2]!.total.attainment).toBeCloseTo(1.025)
  })

  it('drops unusable history points', () => {
    expect(parseGsr(gsrJson).history).toHaveLength(1)
  })

  it('reports an unaccepted key distinctly', () => {
    try {
      parseGsr({ ok: false, error: 'unauthorized' })
      throw new Error('expected a throw')
    } catch (err) {
      expect(err).toBeInstanceOf(BoardDataError)
      expect((err as BoardDataError).kind).toBe('unauthorized')
    }
  })

  it('rejects missing branches', () => {
    expect(() => parseGsr({ ok: true, current: {} })).toThrow(/branches/)
  })

  it('picks the executive focus and ranks the leaderboard', () => {
    const gsr = parseGsr(gsrJson)
    expect(executiveFocus(gsr)?.branch).toBe('PAD')
    expect(leaderboard(gsr).map((b) => b.branch)).toEqual(['OWEN', 'BOWL', 'PAD'])
  })
})

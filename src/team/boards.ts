/**
 * boards — the two team dashboards as typed, validated data.
 *
 * Both Apps Script feeds send dollars as floats. They become integer cents
 * here, at the edge, so the rest of the app keeps the money invariant
 * (docs/ARCHITECTURE.md #1). Anything malformed is rejected rather than
 * half-rendered. A card shows the last good board instead of a wrong one.
 *
 * Pure: no fetch, no storage. See ./fetchBoard and ./teamStore.
 */
import type { Cents } from '@/core/types'

/* ------------------------------------------------------------------- types */

export interface ScoreboardAgent {
  rank: number
  name: string
  yesCount: number
  yesCents: Cents
}

export interface Scoreboard {
  /** When the feed last received numbers from WEMMS (ISO), if known. */
  lastUpdated: string | null
  agents: ScoreboardAgent[]
  totals: { activeAgents: number; yesCount: number; yesCents: Cents }
}

export interface GsrLine {
  actualCents: Cents
  budgetCents: Cents
  /** Fraction, uncapped: 1.08 = 108% of year-end budget. */
  attainment: number
  remainingCents: Cents
}

export interface GsrBranch {
  branch: string
  total: GsrLine
  fao: GsrLine
  pgc: GsrLine
}

export interface GsrPoint {
  timestamp: string
  totalAttainment: number
  faoAttainment: number
  pgcAttainment: number
}

export interface Gsr {
  /** When the feed last received numbers from WEMMS (ISO). */
  lastUpdated: string | null
  branches: GsrBranch[]
  totals: { total: GsrLine; fao: GsrLine; pgc: GsrLine }
  history: GsrPoint[]
}

export type BoardErrorKind = 'unauthorized' | 'unavailable' | 'malformed'

export class BoardDataError extends Error {
  constructor(
    readonly kind: BoardErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'BoardDataError'
  }
}

/* ----------------------------------------------------------------- helpers */

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function num(v: unknown, field: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new BoardDataError('malformed', `${field} is not a number`)
  }
  return n
}

/** Dollars (float) -> integer cents. */
export const dollarsToCents = (dollars: number): Cents => Math.round(dollars * 100)

function isoOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || v === '') return null
  return Number.isNaN(Date.parse(v)) ? null : v
}

/** Feeds answer `{ ok: false, error }` instead of an HTTP error. */
function checkOk(raw: unknown): Json {
  if (!isObject(raw)) throw new BoardDataError('malformed', 'response is not an object')
  if (raw.ok === false) {
    if (raw.error === 'unauthorized') {
      throw new BoardDataError('unauthorized', 'the access key was not accepted')
    }
    throw new BoardDataError('unavailable', String(raw.error ?? 'the board is not available'))
  }
  return raw
}

/* -------------------------------------------------------------- scoreboard */

export function parseScoreboard(raw: unknown): Scoreboard {
  const data = checkOk(raw)
  if (!Array.isArray(data.agents)) throw new BoardDataError('malformed', 'agents is missing')

  const agents = data.agents
    .filter(isObject)
    .map((a, i) => ({
      rank: a.rank === undefined ? i + 1 : num(a.rank, 'rank'),
      name: typeof a.name === 'string' ? a.name.trim() : '',
      yesCount: num(a.yesCount ?? 0, 'yesCount'),
      yesCents: dollarsToCents(num(a.yesDollars ?? 0, 'yesDollars')),
    }))
    .filter((a) => a.name !== '')
    .sort((a, b) => a.rank - b.rank)

  // Totals are recomputed from the rows rather than trusted, so the header
  // can never disagree with the list beneath it.
  const totals = {
    activeAgents: agents.length,
    yesCount: agents.reduce((sum, a) => sum + a.yesCount, 0),
    yesCents: agents.reduce((sum, a) => sum + a.yesCents, 0),
  }

  return { lastUpdated: isoOrNull(data.lastUpdated) ?? isoOrNull(data.generatedAt), agents, totals }
}

/** The agent's own row, matched case- and space-insensitively. */
export function findAgent(board: Scoreboard, name: string | null | undefined): ScoreboardAgent | null {
  const key = normalizeName(name)
  if (!key) return null
  return board.agents.find((a) => normalizeName(a.name) === key) ?? null
}

export function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/* --------------------------------------------------------------------- GSR */

function line(src: Json, prefix: 'total' | 'fao' | 'pgc', where: string): GsrLine {
  const actual = num(src[`${prefix}Actual`], `${where}.${prefix}Actual`)
  const budget = num(src[`${prefix}Budget`], `${where}.${prefix}Budget`)
  const actualCents = dollarsToCents(actual)
  const budgetCents = dollarsToCents(budget)
  return {
    actualCents,
    budgetCents,
    attainment: budgetCents > 0 ? actualCents / budgetCents : 0,
    remainingCents: Math.max(budgetCents - actualCents, 0),
  }
}

export function parseGsr(raw: unknown): Gsr {
  const data = checkOk(raw)
  const current = data.current
  if (!isObject(current) || !Array.isArray(current.branches) || !isObject(current.totals)) {
    throw new BoardDataError('malformed', 'current branches/totals are missing')
  }

  const branches = current.branches.filter(isObject).map((b, i) => {
    const where = `branches[${i}]`
    if (typeof b.branch !== 'string' || !b.branch.trim()) {
      throw new BoardDataError('malformed', `${where}.branch is missing`)
    }
    return {
      branch: b.branch.trim(),
      total: line(b, 'total', where),
      fao: line(b, 'fao', where),
      pgc: line(b, 'pgc', where),
    }
  })

  const t = current.totals
  const totals = {
    total: line(t, 'total', 'totals'),
    fao: line(t, 'fao', 'totals'),
    pgc: line(t, 'pgc', 'totals'),
  }

  const history = (Array.isArray(data.history) ? data.history : [])
    .filter(isObject)
    .flatMap((p) => {
      const timestamp = isoOrNull(p.timestamp)
      const total = Number(p.totalAttainment)
      if (!timestamp || !Number.isFinite(total)) return []
      return [
        {
          timestamp,
          totalAttainment: total,
          faoAttainment: Number(p.faoAttainment) || 0,
          pgcAttainment: Number(p.pgcAttainment) || 0,
        },
      ]
    })

  return { lastUpdated: isoOrNull(data.generatedAt), branches, totals, history }
}

/** "Executive Focus": the branch with the most left to reach its year-end budget. */
export function executiveFocus(gsr: Gsr): GsrBranch | null {
  let best: GsrBranch | null = null
  for (const b of gsr.branches) {
    if (b.total.remainingCents > 0 && (!best || b.total.remainingCents > best.total.remainingCents)) {
      best = b
    }
  }
  return best
}

/** Branches ranked by total attainment, highest first. */
export function leaderboard(gsr: Gsr): GsrBranch[] {
  return [...gsr.branches].sort((a, b) => b.total.attainment - a.total.attainment)
}

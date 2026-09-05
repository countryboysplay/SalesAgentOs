/**
 * SalesTrack — shared domain contract.
 *
 * This file is the single source of truth for every module. Treat it as frozen:
 * if you need a change, it must be coordinated, not made unilaterally.
 *
 * Money rule: all monetary values are stored as INTEGER CENTS. Never store floats.
 * Date rule: calendar dates are 'YYYY-MM-DD' local-time strings, never Date objects
 * and never UTC ISO timestamps. Timestamps (createdAt/modifiedAt) are epoch millis.
 */

/** Integer cents. $389.00 -> 38900 */
export type Cents = number

/** Local calendar date, 'YYYY-MM-DD'. */
export type IsoDate = string

/** Local wall-clock time, 'HH:mm' (24h). */
export type IsoTime = string

/** Epoch milliseconds. */
export type Millis = number

/** Basis points, so 5% -> 500. Integer math keeps commission exact. */
export type BasisPoints = number

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export type SaleStatus = 'active' | 'cancelled' | 'adjusted'

export interface Sale {
  id: string
  /** Original recorded amount, in cents. Never mutated by cancellation. */
  amount: Cents
  date: IsoDate
  time: IsoTime
  /** Category id, or null when uncategorised. */
  categoryId: string | null
  /**
   * Commission rate captured AT THE MOMENT OF SALE (spec §69 historical integrity).
   * Changing the default rate later must never alter this value.
   */
  commissionRate: BasisPoints
  /** Commission in cents, computed and frozen at write time. */
  commissionAmount: Cents
  note: string | null
  status: SaleStatus
  createdAt: Millis
  modifiedAt: Millis
  /** Present only when status === 'cancelled'. */
  cancellation: SaleCancellation | null
  /**
   * When status === 'adjusted', the net-contributing amount. When null, `amount`
   * is used. Lets a sale be revised down without losing the original figure.
   */
  adjustedAmount: Cents | null
}

export interface SaleCancellation {
  cancelledOn: IsoDate
  reason: string | null
  cancelledAt: Millis
}

/** Input accepted by the repository when creating a sale. */
export interface NewSaleInput {
  amount: Cents
  date: IsoDate
  time: IsoTime
  categoryId?: string | null
  /** Omit to resolve from category rule, then global default. */
  commissionRate?: BasisPoints
  note?: string | null
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface Category {
  id: string
  name: string
  /** Emoji or short glyph. Optional and purely decorative. */
  icon: string | null
  /** Overrides the global default rate for sales in this category. */
  commissionRate: BasisPoints | null
  active: boolean
  sortOrder: number
  createdAt: Millis
}

// ---------------------------------------------------------------------------
// Goals — versioned so history is never rewritten (spec §32, §69)
// ---------------------------------------------------------------------------

export type GoalType = 'daily' | 'monthly' | 'annual'

export interface Goal {
  id: string
  type: GoalType
  amount: Cents
  /** Inclusive. */
  effectiveFrom: IsoDate
  /** Inclusive. null means "still in effect". */
  effectiveTo: IsoDate | null
  enabled: boolean
  createdAt: Millis
}

// ---------------------------------------------------------------------------
// Settings & profile
// ---------------------------------------------------------------------------

/** 0 = Sunday … 6 = Saturday, matching Date#getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type ThemePreference = 'system' | 'light' | 'dark'
export type BackupReminder = 'off' | 'weekly' | 'monthly'

export interface AgentProfile {
  displayName: string
  initials: string | null
  createdAt: Millis
}

export interface Settings {
  /** ISO 4217, e.g. 'USD'. Formatting only — no conversion is ever performed. */
  currency: string
  locale: string
  /** Days counted for pace, streaks and "required per workday". */
  workdays: Weekday[]
  /** Extra non-working dates, e.g. holidays. */
  excludedDates: IsoDate[]
  weekStartsOn: Weekday
  theme: ThemePreference
  commissionEnabled: boolean
  defaultCommissionRate: BasisPoints
  backupReminder: BackupReminder
  lastBackupAt: Millis | null
  reducedMotion: boolean | null
  onboardingCompletedAt: Millis | null
  schemaVersion: number
}

// ---------------------------------------------------------------------------
// Derived metrics — produced by src/core/calc, consumed by screens.
// Screens must NEVER recompute these inline.
// ---------------------------------------------------------------------------

export interface PeriodTotals {
  /**
   * Total value of every recorded original sale, cancelled ones included
   * (spec §18). This is deliberately the *pre-cancellation* figure so that
   * `netSales === grossSales - cancelledSales` holds by construction.
   */
  grossSales: Cents
  /**
   * Value taken back out: the full amount of cancelled sales plus the
   * written-down portion of adjusted ones.
   */
  cancelledSales: Cents
  /** grossSales - cancelledSales. The headline figure. */
  netSales: Cents
  /** Count of active (non-cancelled) sales. */
  saleCount: number
  /** netSales / saleCount, 0 when saleCount is 0. */
  averageSale: Cents
  estimatedCommission: Cents
}

export type PaceStatus = 'ahead' | 'on-track' | 'behind' | 'goal-reached' | 'no-goal'

export interface PaceResult {
  status: PaceStatus
  /** Goal in force for the period, or null when disabled/unset. */
  goal: Cents | null
  actual: Cents
  /** What the agent "should" have sold by now, given workdays elapsed. */
  expected: Cents
  /** actual - expected. Positive means ahead. */
  difference: Cents
  /** Fraction, not percent. 1.0 === 100%. Uncapped, so 124% -> 1.24. */
  progress: number
  remaining: Cents
  workdaysTotal: number
  workdaysElapsed: number
  workdaysRemaining: number
  /** Remaining goal / remaining workdays. null when no workdays remain. */
  requiredPerWorkday: Cents | null
}

export interface PersonalRecords {
  bestDay: { date: IsoDate; amount: Cents } | null
  bestMonth: { month: string; amount: Cents } | null
  largestSale: { id: string; date: IsoDate; amount: Cents } | null
  mostSalesInDay: { date: IsoDate; count: number } | null
  /** Consecutive configured workdays hitting the daily goal (spec §30, §77). */
  goalStreak: number
}

export interface CategoryPerformance {
  categoryId: string | null
  name: string
  netSales: Cents
  saleCount: number
  averageSale: Cents
  estimatedCommission: Cents
  /** Fraction of total net sales across all categories. */
  share: number
}

// ---------------------------------------------------------------------------
// Backup envelope (spec §39, §40)
// ---------------------------------------------------------------------------

export interface BackupFile {
  format: 'salestrack-backup'
  version: number
  createdAt: Millis
  app: { name: 'SalesTrack'; version: string }
  data: {
    profile: AgentProfile
    settings: Settings
    sales: Sale[]
    categories: Category[]
    goals: Goal[]
  }
}

/** Summary shown on the restore confirmation screen. */
export interface BackupSummary {
  createdAt: Millis
  saleCount: number
  dateRange: { from: IsoDate; to: IsoDate } | null
  goalCount: number
  categoryCount: number
}

/**
 * Test-only builders for the calculation engine.
 *
 * Not imported by application code — it exists so the specs read as sales
 * scenarios rather than as object literals.
 */
import { commissionFor } from '../money'
import type {
  Category,
  Cents,
  Goal,
  GoalType,
  IsoDate,
  Sale,
  Settings,
  Weekday,
} from '../types'

let seq = 0

export function resetIds(): void {
  seq = 0
}

export interface SaleSeed {
  amount: Cents
  date: IsoDate
  id?: string
  time?: string
  categoryId?: string | null
  commissionRate?: number
  note?: string | null
  status?: Sale['status']
  adjustedAmount?: Cents | null
  cancelledOn?: IsoDate
  createdAt?: number
}

export function makeSale(seed: SaleSeed): Sale {
  seq += 1
  const rate = seed.commissionRate ?? 500
  const status = seed.status ?? 'active'
  return {
    id: seed.id ?? `sale-${seq}`,
    amount: seed.amount,
    date: seed.date,
    time: seed.time ?? '09:00',
    categoryId: seed.categoryId ?? null,
    commissionRate: rate,
    commissionAmount: commissionFor(seed.amount, rate),
    note: seed.note ?? null,
    status,
    createdAt: seed.createdAt ?? seq,
    modifiedAt: seed.createdAt ?? seq,
    cancellation:
      status === 'cancelled'
        ? { cancelledOn: seed.cancelledOn ?? seed.date, reason: null, cancelledAt: seq }
        : null,
    adjustedAmount: seed.adjustedAmount ?? null,
  }
}

/** Same sale, marked cancelled on `cancelledOn` (defaults to its own date). */
export function cancel(sale: Sale, cancelledOn: IsoDate = sale.date): Sale {
  return {
    ...sale,
    status: 'cancelled',
    cancellation: { cancelledOn, reason: null, cancelledAt: sale.createdAt + 1 },
  }
}

/** Same sale, revised to a new net-contributing amount. */
export function adjust(sale: Sale, adjustedAmount: Cents): Sale {
  return { ...sale, status: 'adjusted', adjustedAmount }
}

export interface GoalSeed {
  type: GoalType
  amount: Cents
  effectiveFrom: IsoDate
  effectiveTo?: IsoDate | null
  enabled?: boolean
  id?: string
  createdAt?: number
}

export function makeGoal(seed: GoalSeed): Goal {
  seq += 1
  return {
    id: seed.id ?? `goal-${seq}`,
    type: seed.type,
    amount: seed.amount,
    effectiveFrom: seed.effectiveFrom,
    effectiveTo: seed.effectiveTo ?? null,
    enabled: seed.enabled ?? true,
    createdAt: seed.createdAt ?? seq,
  }
}

export function makeCategory(seed: Partial<Category> & { id: string; name: string }): Category {
  seq += 1
  return {
    icon: null,
    commissionRate: null,
    active: true,
    sortOrder: 0,
    createdAt: seq,
    ...seed,
  }
}

/** Monday-Friday, USD, 5% default — the spec's default agent (§8). */
export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    currency: 'USD',
    locale: 'en-US',
    workdays: [1, 2, 3, 4, 5] as Weekday[],
    excludedDates: [],
    weekStartsOn: 1,
    theme: 'system',
    commissionEnabled: true,
    defaultCommissionRate: 500,
    backupReminder: 'off',
    lastBackupAt: null,
    reducedMotion: null,
    onboardingCompletedAt: null,
    schemaVersion: 1,
    ...overrides,
  }
}

/** en-US formatting settings for the display specs. */
export const FORMAT = { currency: 'USD', locale: 'en-US' }

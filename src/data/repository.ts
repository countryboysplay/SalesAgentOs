/**
 * SalesTrack — the CRUD surface the app store calls.
 *
 * Rules this module enforces on behalf of the spec:
 *
 *  - §69 Historical integrity. `createSale` resolves the commission rate once
 *    and FREEZES both the rate and the computed amount onto the record. Later
 *    changes to the global default or to a category rule can never move it.
 *  - §16/§18 Cancellation is a status change plus a cancellation block. A
 *    cancelled sale keeps its original amount and stays in the ledger forever.
 *  - §32 Goals are versioned rows. Setting a new goal closes the previous row
 *    by dating its `effectiveTo` to the day before the new one starts. No
 *    historical row is ever rewritten or removed.
 *  - §34 A category with sales attached is never hard-deleted; the delete is
 *    downgraded to a deactivate so old sales keep their label.
 *
 * Every mutation runs inside a transaction, and batch writes are issued
 * together so IndexedDB commits them all or none.
 */

import type { IDBPObjectStore } from 'idb'
import { commissionFor } from '../core/money'
import {
  ALL_STORES,
  StorageError,
  dayBefore,
  getDB,
  getMeta,
  isValidIsoDate,
  isValidIsoTime,
  newId,
  putMeta,
  todayIso,
  toStorageError,
  type SalesTrackDB,
} from './db'
import type {
  AgentProfile,
  BasisPoints,
  Category,
  Cents,
  Goal,
  GoalType,
  IsoDate,
  IsoTime,
  NewSaleInput,
  Sale,
  SaleStatus,
  Settings,
} from '../core/types'

/** Lexicographic bounds for 'YYYY-MM-DD' key ranges. */
const MIN_DATE = '0000-01-01'
const MAX_DATE = '9999-12-31'

/** Cap on how far `recentCategories` walks back before giving up. */
const RECENT_SCAN_LIMIT = 400

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function invalid(message: string): StorageError {
  return new StorageError('invalid-input', message)
}

function assertCents(value: unknown, label: string): asserts value is Cents {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw invalid(`${label} must be a whole number of cents.`)
  }
  if (value < 0) throw invalid(`${label} cannot be negative.`)
  if (value > Number.MAX_SAFE_INTEGER) throw invalid(`${label} is too large to store.`)
}

function assertBasisPoints(value: unknown, label: string): asserts value is BasisPoints {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid(`${label} must be a whole number of basis points (5% = 500).`)
  }
  if (value < 0 || value > 1_000_000) throw invalid(`${label} is outside the supported range.`)
}

function assertIsoDate(value: unknown, label: string): asserts value is IsoDate {
  if (!isValidIsoDate(value)) throw invalid(`${label} must be a real calendar date in YYYY-MM-DD form.`)
}

function assertIsoTime(value: unknown, label: string): asserts value is IsoTime {
  if (!isValidIsoTime(value)) throw invalid(`${label} must be a 24-hour time in HH:mm form.`)
}

function normaliseNote(note: unknown): string | null {
  if (note === null || note === undefined) return null
  if (typeof note !== 'string') throw invalid('A note must be text.')
  const trimmed = note.trim()
  return trimmed.length === 0 ? null : trimmed
}

// ---------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------

/**
 * The value frozen onto a sale at write time (§69).
 *
 * Delegates to `core/money.commissionFor` so the number stored on the record is
 * produced by exactly the same integer basis-point maths every screen and
 * calculation uses. A second implementation here could drift, and a drifting
 * commission figure is unfixable once it has been frozen into history.
 */
export function computeCommission(amount: Cents, rate: BasisPoints): Cents {
  return commissionFor(amount, rate)
}

/**
 * Resolution order (spec §33): explicit per-sale override, then the category's
 * own rule, then the global default.
 *
 * Note that `settings.commissionEnabled` is deliberately NOT consulted. It is a
 * display switch. Freezing the real rate means a user who turns commission on
 * later still sees correct history instead of a wall of zeroes, and turning it
 * off never destroys data.
 */
export function resolveCommissionRate(
  explicit: BasisPoints | null | undefined,
  category: Category | null | undefined,
  settings: Settings,
): BasisPoints {
  if (explicit !== null && explicit !== undefined) return explicit
  if (category && category.commissionRate !== null && category.commissionRate !== undefined) {
    return category.commissionRate
  }
  return settings.defaultCommissionRate
}

// ---------------------------------------------------------------------------
// Boot hydrate
// ---------------------------------------------------------------------------

export interface AppData {
  profile: AgentProfile
  settings: Settings
  sales: Sale[]
  categories: Category[]
  goals: Goal[]
}

/**
 * Read the entire database in one transaction. This is the only read the app
 * performs at boot; everything after it is served from memory (§64, no spinners
 * for local reads).
 */
export async function loadAll(): Promise<AppData> {
  const db = await getDB()
  const tx = db.transaction([...ALL_STORES], 'readonly')
  const meta = tx.objectStore('meta')

  const [sales, categories, goals, profile, settings] = await Promise.all([
    tx.objectStore('sales').getAll(),
    tx.objectStore('categories').getAll(),
    tx.objectStore('goals').getAll(),
    getMeta(meta, 'profile'),
    getMeta(meta, 'settings'),
  ])
  await tx.done

  if (!settings || !profile) {
    // Seeding happens in the v1 migration, so this means the meta store was
    // damaged. Surface it rather than silently inventing defaults over the top
    // of real sales data.
    throw new StorageError(
      'transaction-failed',
      'Local settings could not be read from this device. Restoring a backup will rebuild them.',
    )
  }

  sales.sort(compareSales)
  categories.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  goals.sort((a, b) => a.type.localeCompare(b.type) || a.effectiveFrom.localeCompare(b.effectiveFrom))

  return { profile, settings, sales, categories, goals }
}

/** Chronological: date, then time, then insertion order. */
function compareSales(a: Sale, b: Sale): number {
  return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.createdAt - b.createdAt
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export async function getSale(id: string): Promise<Sale | undefined> {
  const db = await getDB()
  return db.get('sales', id)
}

export async function listSales(): Promise<Sale[]> {
  const db = await getDB()
  const sales = await db.getAll('sales')
  sales.sort(compareSales)
  return sales
}

/**
 * Create a sale, freezing its commission at write time (§69).
 *
 * `settings` and `categories` are passed in rather than re-read so the value
 * the user saw in the Add Sale sheet is the value that gets frozen.
 */
export async function createSale(
  input: NewSaleInput,
  settings: Settings,
  categories: Category[],
): Promise<Sale> {
  assertCents(input.amount, 'Sale amount')
  if (input.amount === 0) throw invalid('A sale needs an amount.')
  assertIsoDate(input.date, 'Sale date')
  assertIsoTime(input.time, 'Sale time')

  const categoryId = input.categoryId ?? null
  let category: Category | null = null
  if (categoryId !== null) {
    if (typeof categoryId !== 'string') throw invalid('Category is not valid.')
    category = categories.find((c) => c.id === categoryId) ?? null
    if (!category) throw new StorageError('not-found', 'That category no longer exists on this device.')
  }

  if (input.commissionRate !== null && input.commissionRate !== undefined) {
    assertBasisPoints(input.commissionRate, 'Commission rate')
  }

  const commissionRate = resolveCommissionRate(input.commissionRate, category, settings)
  assertBasisPoints(commissionRate, 'Commission rate')

  const now = Date.now()
  const sale: Sale = {
    id: newId(),
    amount: input.amount,
    date: input.date,
    time: input.time,
    categoryId,
    commissionRate,
    commissionAmount: computeCommission(input.amount, commissionRate),
    note: normaliseNote(input.note),
    status: 'active',
    createdAt: now,
    modifiedAt: now,
    cancellation: null,
    adjustedAmount: null,
  }

  await withSaleStore((store) => [store.add(sale)])
  return sale
}

export interface SaleUpdate {
  amount?: Cents
  date?: IsoDate
  time?: IsoTime
  categoryId?: string | null
  /** Explicitly re-freeze a different rate on this sale. */
  commissionRate?: BasisPoints
  note?: string | null
  /** §17: revise the net-contributing figure without losing the original. */
  adjustedAmount?: Cents | null
  status?: Extract<SaleStatus, 'active' | 'adjusted'>
}

/**
 * Edit a sale.
 *
 * Commission is recomputed from the sale's OWN frozen rate (or an explicitly
 * supplied one) — never from the current global default. Editing March's amount
 * in September must not silently apply September's rate.
 *
 * Cancellation is not reachable from here; use `cancelSale`/`uncancelSale`.
 */
export async function updateSale(id: string, patch: SaleUpdate): Promise<Sale> {
  if (patch.amount !== undefined) {
    assertCents(patch.amount, 'Sale amount')
    if (patch.amount === 0) throw invalid('A sale needs an amount.')
  }
  if (patch.date !== undefined) assertIsoDate(patch.date, 'Sale date')
  if (patch.time !== undefined) assertIsoTime(patch.time, 'Sale time')
  if (patch.commissionRate !== undefined) assertBasisPoints(patch.commissionRate, 'Commission rate')
  if (patch.adjustedAmount !== undefined && patch.adjustedAmount !== null) {
    assertCents(patch.adjustedAmount, 'Adjusted amount')
  }

  const db = await getDB()
  const tx = db.transaction('sales', 'readwrite')
  const existing = await tx.store.get(id)
  if (!existing) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new StorageError('not-found', 'That sale is no longer on this device.')
  }

  const amount = patch.amount ?? existing.amount
  const commissionRate = patch.commissionRate ?? existing.commissionRate

  const updated: Sale = {
    ...existing,
    amount,
    date: patch.date ?? existing.date,
    time: patch.time ?? existing.time,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : existing.categoryId,
    commissionRate,
    commissionAmount: computeCommission(amount, commissionRate),
    note: patch.note !== undefined ? normaliseNote(patch.note) : existing.note,
    adjustedAmount: patch.adjustedAmount !== undefined ? patch.adjustedAmount : existing.adjustedAmount,
    status: patch.status ?? existing.status,
    modifiedAt: Date.now(),
  }

  await commit(tx, tx.store.put(updated))
  return updated
}

/**
 * §16/§18: cancel without deleting. The original `amount` is untouched so the
 * ledger keeps showing the $500 that was struck through.
 */
export async function cancelSale(
  id: string,
  reason: string | null = null,
  cancelledOn: IsoDate = todayIso(),
): Promise<Sale> {
  assertIsoDate(cancelledOn, 'Cancellation date')

  const db = await getDB()
  const tx = db.transaction('sales', 'readwrite')
  const existing = await tx.store.get(id)
  if (!existing) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new StorageError('not-found', 'That sale is no longer on this device.')
  }

  const cancelled: Sale = {
    ...existing,
    status: 'cancelled',
    cancellation: {
      cancelledOn,
      reason: normaliseNote(reason),
      cancelledAt: Date.now(),
    },
    modifiedAt: Date.now(),
  }
  await commit(tx, tx.store.put(cancelled))
  return cancelled
}

/** Undo of a cancellation (§70). Returns the sale to active, or adjusted. */
export async function uncancelSale(id: string): Promise<Sale> {
  const db = await getDB()
  const tx = db.transaction('sales', 'readwrite')
  const existing = await tx.store.get(id)
  if (!existing) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new StorageError('not-found', 'That sale is no longer on this device.')
  }

  const restored: Sale = {
    ...existing,
    status: existing.adjustedAmount !== null ? 'adjusted' : 'active',
    cancellation: null,
    modifiedAt: Date.now(),
  }
  await commit(tx, tx.store.put(restored))
  return restored
}

/**
 * Hard delete. Returns the removed record so the Undo toast (§70) can hand it
 * straight back to `restoreSale`.
 */
export async function deleteSale(id: string): Promise<Sale> {
  const db = await getDB()
  const tx = db.transaction('sales', 'readwrite')
  const existing = await tx.store.get(id)
  if (!existing) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new StorageError('not-found', 'That sale is no longer on this device.')
  }
  await commit(tx, tx.store.delete(id))
  return existing
}

/** Undo of a delete. Takes the whole record back, ids and timestamps included. */
export async function restoreSale(sale: Sale): Promise<Sale> {
  return (await restoreSales([sale]))[0]
}

/** Atomic batch restore — every sale lands or none does. */
export async function restoreSales(sales: Sale[]): Promise<Sale[]> {
  if (sales.length === 0) return []
  for (const sale of sales) assertRestorableSale(sale)

  await withSaleStore((store) => sales.map((sale) => store.put(sale)))
  return sales
}

function assertRestorableSale(sale: Sale): void {
  if (!sale || typeof sale !== 'object') throw invalid('That sale record cannot be restored.')
  if (typeof sale.id !== 'string' || sale.id.length === 0) throw invalid('That sale record has no identifier.')
  assertCents(sale.amount, 'Sale amount')
  assertIsoDate(sale.date, 'Sale date')
  assertIsoTime(sale.time, 'Sale time')
}

// ---------------------------------------------------------------------------
// Sale queries — index-backed, never full scans
// ---------------------------------------------------------------------------

/** Inclusive on both ends. Uses the `date` index. */
export async function salesInRange(from: IsoDate, to: IsoDate): Promise<Sale[]> {
  assertIsoDate(from, 'Range start')
  assertIsoDate(to, 'Range end')
  const [lo, hi] = from <= to ? [from, to] : [to, from]

  const db = await getDB()
  const sales = await db.getAllFromIndex('sales', 'date', IDBKeyRange.bound(lo, hi))
  sales.sort(compareSales)
  return sales
}

/** Sales of one status within a date window, via the compound index. */
export async function salesByStatusInRange(
  status: SaleStatus,
  from: IsoDate,
  to: IsoDate,
): Promise<Sale[]> {
  assertIsoDate(from, 'Range start')
  assertIsoDate(to, 'Range end')
  const db = await getDB()
  const sales = await db.getAllFromIndex(
    'sales',
    'status-date',
    IDBKeyRange.bound([status, from], [status, to]),
  )
  sales.sort(compareSales)
  return sales
}

/**
 * Most recently used category ids, newest first — the quick chips in the Add
 * Sale sheet (§14). Walks the `date` index backwards rather than scanning the
 * whole store, and stops after a bounded number of records.
 */
export async function recentCategories(limit = 3): Promise<string[]> {
  if (limit <= 0) return []
  const db = await getDB()
  const tx = db.transaction('sales', 'readonly')

  const ordered: string[] = []
  const seen = new Set<string>()
  let scanned = 0
  let cursor = await tx.store.index('date').openCursor(null, 'prev')

  while (cursor && ordered.length < limit && scanned < RECENT_SCAN_LIMIT) {
    scanned += 1
    const categoryId = cursor.value.categoryId
    if (categoryId && !seen.has(categoryId)) {
      seen.add(categoryId)
      ordered.push(categoryId)
    }
    cursor = await cursor.continue()
  }

  await tx.done
  return ordered
}

export async function countSales(): Promise<number> {
  const db = await getDB()
  return db.count('sales')
}

/** Earliest and latest sale dates, for Storage Health (§42). */
export async function salesDateRange(): Promise<{ from: IsoDate; to: IsoDate } | null> {
  const db = await getDB()
  const tx = db.transaction('sales', 'readonly')
  const index = tx.store.index('date')

  const first = await index.openCursor(null, 'next')
  if (!first) {
    await tx.done
    return null
  }
  const from = first.value.date
  const last = await index.openCursor(null, 'prev')
  const to = last ? last.value.date : from
  await tx.done
  return { from, to }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface NewCategoryInput {
  name: string
  icon?: string | null
  commissionRate?: BasisPoints | null
  sortOrder?: number
}

export interface CategoryUpdate {
  name?: string
  icon?: string | null
  commissionRate?: BasisPoints | null
  active?: boolean
  sortOrder?: number
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDB()
  const categories = await db.getAllFromIndex('categories', 'sortOrder')
  return categories
}

export async function createCategory(input: NewCategoryInput): Promise<Category> {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length === 0) throw invalid('A category needs a name.')
  if (input.commissionRate !== null && input.commissionRate !== undefined) {
    assertBasisPoints(input.commissionRate, 'Category commission rate')
  }

  const db = await getDB()
  const tx = db.transaction('categories', 'readwrite')
  // Max + 1, not count(). A deleted category leaves a gap, so counting hands
  // the new row a number an existing one already holds — and a reorder that
  // swaps two equal values is a silent no-op.
  const existingRows = await tx.store.getAll()
  const highest = existingRows.reduce((max, row) => (row.sortOrder > max ? row.sortOrder : max), -1)
  const sortOrder = input.sortOrder ?? highest + 1

  const category: Category = {
    id: newId(),
    name,
    icon: input.icon ?? null,
    commissionRate: input.commissionRate ?? null,
    active: true,
    sortOrder,
    createdAt: Date.now(),
  }
  await commit(tx, tx.store.add(category))
  return category
}

export async function updateCategory(id: string, patch: CategoryUpdate): Promise<Category> {
  if (patch.name !== undefined && patch.name.trim().length === 0) {
    throw invalid('A category needs a name.')
  }
  if (patch.commissionRate !== null && patch.commissionRate !== undefined) {
    assertBasisPoints(patch.commissionRate, 'Category commission rate')
  }

  const db = await getDB()
  const tx = db.transaction('categories', 'readwrite')
  const existing = await tx.store.get(id)
  if (!existing) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new StorageError('not-found', 'That category is no longer on this device.')
  }

  const updated: Category = {
    ...existing,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    icon: patch.icon !== undefined ? patch.icon : existing.icon,
    commissionRate: patch.commissionRate !== undefined ? patch.commissionRate : existing.commissionRate,
    active: patch.active ?? existing.active,
    sortOrder: patch.sortOrder ?? existing.sortOrder,
  }
  await commit(tx, tx.store.put(updated))
  return updated
}

/**
 * §34: inactive categories stay attached to old sales. Deactivating hides a
 * category from the picker without touching a single historical record.
 */
export async function deactivateCategory(id: string): Promise<Category> {
  return updateCategory(id, { active: false })
}

export interface CategoryDeleteResult {
  outcome: 'deleted' | 'deactivated'
  category: Category
  /** How many sales still point at this category. */
  referencingSales: number
}

/**
 * Delete a category — but only when nothing references it.
 *
 * §34 is explicit that inactive categories remain attached to old sales, so a
 * delete against a category with history is downgraded to a deactivate. The
 * caller gets the outcome back and can tell the user what actually happened.
 * The reference count and the write share one transaction, so a sale added
 * concurrently cannot slip through between the check and the delete.
 */
export async function deleteCategory(id: string): Promise<CategoryDeleteResult> {
  const db = await getDB()
  const tx = db.transaction(['categories', 'sales'], 'readwrite')
  const categories = tx.objectStore('categories')

  const existing = await categories.get(id)
  if (!existing) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new StorageError('not-found', 'That category is no longer on this device.')
  }

  const referencingSales = await tx.objectStore('sales').index('categoryId').count(IDBKeyRange.only(id))

  if (referencingSales > 0) {
    const deactivated: Category = { ...existing, active: false }
    await commit(tx, categories.put(deactivated))
    return { outcome: 'deactivated', category: deactivated, referencingSales }
  }

  await commit(tx, categories.delete(id))
  return { outcome: 'deleted', category: existing, referencingSales: 0 }
}

// ---------------------------------------------------------------------------
// Goals — versioned rows (§32, §69)
// ---------------------------------------------------------------------------

export async function listGoals(type?: GoalType): Promise<Goal[]> {
  const db = await getDB()
  const goals = type
    ? await db.getAllFromIndex(
        'goals',
        'type-effectiveFrom',
        IDBKeyRange.bound([type, MIN_DATE], [type, MAX_DATE]),
      )
    : await db.getAll('goals')
  goals.sort((a, b) => a.type.localeCompare(b.type) || a.effectiveFrom.localeCompare(b.effectiveFrom))
  return goals
}

/**
 * Set a goal, effective from a date.
 *
 * The previous row is CLOSED, not changed: its `effectiveTo` becomes the day
 * before `effectiveFrom`, and its amount is left exactly as it was. January
 * keeps comparing against January's number forever (§77 Goal Change Test).
 *
 * Interval handling:
 *   - Rows starting earlier that are still open (or that overlap the new start)
 *     are closed at `effectiveFrom - 1 day`.
 *   - Rows starting later are left untouched, and bound the new row's
 *     `effectiveTo` so the timeline never overlaps.
 *   - A row with the SAME `effectiveFrom` is a correction of that exact window,
 *     so it is replaced in place, keeping its id. This is the only case where a
 *     stored row's amount changes, and it never affects a different period.
 */
export async function setGoal(type: GoalType, amount: Cents, effectiveFrom: IsoDate): Promise<Goal> {
  assertCents(amount, 'Goal amount')
  return writeGoalRow(type, amount, effectiveFrom, true)
}

/**
 * Turn a goal off from a date onward. History is preserved: the current row is
 * closed the day before, and a disabled row records "no goal from here".
 */
export async function disableGoal(type: GoalType, effectiveFrom: IsoDate = todayIso()): Promise<Goal> {
  return writeGoalRow(type, 0, effectiveFrom, false)
}

async function writeGoalRow(
  type: GoalType,
  amount: Cents,
  effectiveFrom: IsoDate,
  enabled: boolean,
): Promise<Goal> {
  assertIsoDate(effectiveFrom, 'Goal start date')
  if (type !== 'daily' && type !== 'monthly' && type !== 'annual') {
    throw invalid('That goal type is not supported.')
  }

  const db = await getDB()
  const tx = db.transaction('goals', 'readwrite')
  const store = tx.store

  const existing = await store
    .index('type-effectiveFrom')
    .getAll(IDBKeyRange.bound([type, MIN_DATE], [type, MAX_DATE]))

  const closeAt = dayBefore(effectiveFrom)
  const ops: Promise<unknown>[] = []
  let sameStart: Goal | undefined

  for (const row of existing) {
    if (row.effectiveFrom === effectiveFrom) {
      sameStart = row
      continue
    }
    if (row.effectiveFrom < effectiveFrom) {
      // Close it only if it is still open or would overlap the new row.
      if (row.effectiveTo === null || row.effectiveTo >= effectiveFrom) {
        ops.push(store.put({ ...row, effectiveTo: closeAt }))
      }
      continue
    }
    // Starts later. `setGoal` means "from this date onward, the goal is X" —
    // the UI says exactly that — so a row starting later is superseded, not
    // preserved. Leaving it would bound the new row into an island and leave
    // the OLD goal in force from its start date forever, which is what the
    // user just changed.
    ops.push(store.delete(row.id))
  }

  const goal: Goal = {
    id: sameStart ? sameStart.id : newId(),
    type,
    amount,
    effectiveFrom,
    effectiveTo: null,
    enabled,
    createdAt: sameStart ? sameStart.createdAt : Date.now(),
  }

  ops.push(store.put(goal))
  await commit(tx, ...ops)
  return goal
}

// ---------------------------------------------------------------------------
// Settings & profile
// ---------------------------------------------------------------------------

export async function saveSettings(settings: Settings): Promise<Settings> {
  if (!settings || typeof settings !== 'object') throw invalid('Settings could not be saved.')
  assertBasisPoints(settings.defaultCommissionRate, 'Default commission rate')

  const db = await getDB()
  const tx = db.transaction('meta', 'readwrite')
  await commit(tx, putMeta(tx.store, 'settings', settings))
  return settings
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDB()
  const settings = await getMeta(db.transaction('meta', 'readonly').store, 'settings')
  if (!settings) {
    throw new StorageError('transaction-failed', 'Local settings could not be read from this device.')
  }
  return settings
}

export async function saveProfile(profile: AgentProfile): Promise<AgentProfile> {
  if (!profile || typeof profile !== 'object') throw invalid('Profile could not be saved.')

  const db = await getDB()
  const tx = db.transaction('meta', 'readwrite')
  await commit(tx, putMeta(tx.store, 'profile', profile))
  return profile
}

// ---------------------------------------------------------------------------
// Transaction plumbing
// ---------------------------------------------------------------------------

interface Committable {
  done: Promise<unknown>
}

/**
 * Await commit and translate an abort into a message the UI can show.
 *
 * Pending request promises are passed in and awaited alongside `tx.done`: an
 * unobserved rejection is both a lost error and an unhandled-rejection warning.
 */
async function commit(tx: Committable, ...ops: Promise<unknown>[]): Promise<void> {
  try {
    await Promise.all([...ops, tx.done])
  } catch (err) {
    throw toStorageError(err, 'transaction-failed')
  }
}

type SalesStore = IDBPObjectStore<SalesTrackDB, ['sales'], 'sales', 'readwrite'>

/**
 * Run a body against the sales store inside one transaction.
 *
 * The body must not await anything: every request it issues has to be queued in
 * the same tick, or IndexedDB auto-commits the transaction underneath it and a
 * "batch" write stops being atomic. It returns its pending requests so they are
 * committed — and observed — together.
 */
async function withSaleStore(body: (store: SalesStore) => Promise<unknown>[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('sales', 'readwrite')
  const ops = body(tx.store)
  await commit(tx, ...ops)
}

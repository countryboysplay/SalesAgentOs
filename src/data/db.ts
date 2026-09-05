/**
 * SalesTrack — IndexedDB schema, open logic and migrations.
 *
 * This is the bottom of the stack. Everything the user owns lives here and
 * nowhere else: there is no server, no sync, no second copy. Spec §76 ranks
 * data integrity as priority #1, so this module is deliberately defensive:
 *
 *  - Every failure mode of `indexedDB.open` is mapped to a typed `StorageError`
 *    with a human-readable `userMessage` the UI can surface. Nothing fails
 *    silently.
 *  - Migrations are an append-only ordered list. Adding v2 means appending one
 *    entry; the v1 step is never edited again.
 *  - Seeding happens inside the upgrade transaction, so a first open either
 *    produces a complete database or none at all.
 *
 * Storage layout
 *   sales      keyPath 'id'  idx: date, status, categoryId, ['status','date']
 *   categories keyPath 'id'  idx: sortOrder
 *   goals      keyPath 'id'  idx: ['type','effectiveFrom']
 *   meta       out-of-line string keys: 'profile' | 'settings' | 'schemaVersion'
 */

import { addDays } from '../core/date'
import {
  openDB,
  deleteDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb'
import type {
  AgentProfile,
  Category,
  Goal,
  GoalType,
  IsoDate,
  Millis,
  Sale,
  SaleStatus,
  Settings,
} from '../core/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DB_NAME = 'salestrack'

/** Bump this AND append a migration when the schema changes. Never edit history. */
export const DB_VERSION = 1

/** Written into `meta.schemaVersion` and `Settings.schemaVersion`. */
export const SCHEMA_VERSION = 1

/** How long we wait for another tab to release an old-version connection. */
const BLOCKED_TIMEOUT_MS = 8000

// ---------------------------------------------------------------------------
// Typed schema
// ---------------------------------------------------------------------------

/**
 * Keys of the `meta` key/value store, with the shape stored under each.
 * Kept as a map so `getMeta`/`putMeta` stay type-safe without casts leaking out.
 */
export interface MetaShape {
  profile: AgentProfile
  settings: Settings
  schemaVersion: number
}

export type MetaKey = keyof MetaShape
export type MetaValue = MetaShape[MetaKey]

export interface SalesTrackDB extends DBSchema {
  sales: {
    key: string
    value: Sale
    indexes: {
      /** 'YYYY-MM-DD' sorts lexicographically, so range queries are exact. */
      date: IsoDate
      status: SaleStatus
      /**
       * Sales with `categoryId: null` are absent from this index — null is not
       * a valid IndexedDB key. That is intended: uncategorised sales are never
       * a category's referents.
       */
      categoryId: string
      'status-date': [SaleStatus, IsoDate]
    }
  }
  categories: {
    key: string
    value: Category
    indexes: { sortOrder: number }
  }
  goals: {
    key: string
    value: Goal
    indexes: { 'type-effectiveFrom': [GoalType, IsoDate] }
  }
  meta: {
    key: MetaKey
    value: MetaValue
  }
}

export type SalesTrackDatabase = IDBPDatabase<SalesTrackDB>

/** Every store name, in the order a full-database transaction should claim them. */
export const ALL_STORES = ['sales', 'categories', 'goals', 'meta'] as const
export type StoreName = (typeof ALL_STORES)[number]

// ---------------------------------------------------------------------------
// Typed errors — the UI must always have something honest to say
// ---------------------------------------------------------------------------

export type StorageErrorCode =
  /** IndexedDB is missing or disabled (private browsing, hardened settings). */
  | 'unavailable'
  /** Another tab holds an older version of the database open. */
  | 'blocked'
  /** On-disk database is newer than this build of the app. */
  | 'version-conflict'
  /** open() rejected for a reason we could not classify. */
  | 'open-failed'
  /** Device storage is full or the origin's quota is exhausted. */
  | 'quota-exceeded'
  /** A read/write transaction aborted. */
  | 'transaction-failed'
  /** Caller passed something the data model does not allow. */
  | 'invalid-input'
  /** Referenced record does not exist. */
  | 'not-found'
  /** A restore failed and rollback could not fully complete. */
  | 'restore-failed'
  /** A freshly built backup failed to read back, so it was not offered. */
  | 'backup-unreadable'

export class StorageError extends Error {
  readonly code: StorageErrorCode
  /** Plain-language sentence safe to render directly to the user. */
  readonly userMessage: string

  constructor(code: StorageErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(`[${code}] ${userMessage}`)
    this.name = 'StorageError'
    this.code = code
    this.userMessage = userMessage
    if (options && 'cause' in options) {
      // `cause` is ES2022; assign defensively so older lib targets still work.
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

export function isStorageError(value: unknown): value is StorageError {
  return value instanceof StorageError
}

/** Translate a raw DOMException from IndexedDB into something we can act on. */
export function toStorageError(err: unknown, fallback: StorageErrorCode = 'open-failed'): StorageError {
  if (isStorageError(err)) return err

  const name = typeof err === 'object' && err !== null && 'name' in err ? String((err as Error).name) : ''

  switch (name) {
    case 'VersionError':
      return new StorageError(
        'version-conflict',
        'This device holds sales data saved by a newer version of SalesTrack. Update the app, then reopen it.',
        { cause: err },
      )
    case 'QuotaExceededError':
      return new StorageError(
        'quota-exceeded',
        'This device is out of storage space, so the change was not saved. Free up space and try again.',
        { cause: err },
      )
    case 'SecurityError':
    case 'InvalidStateError':
    case 'UnknownError':
      return new StorageError(
        'unavailable',
        'This browser is blocking local storage, so sales cannot be saved. Private or incognito windows often do this — open SalesTrack in a normal window.',
        { cause: err },
      )
    case 'AbortError':
      return new StorageError(
        'transaction-failed',
        'The change could not be saved to this device and was rolled back. Nothing was lost — try again.',
        { cause: err },
      )
    default:
      return new StorageError(fallback, FALLBACK_MESSAGES[fallback], { cause: err })
  }
}

const FALLBACK_MESSAGES: Record<StorageErrorCode, string> = {
  unavailable: 'This browser is blocking local storage, so sales cannot be saved on this device.',
  blocked: 'SalesTrack is open in another tab or window. Close the others, then reload this page.',
  'version-conflict': 'This device holds sales data saved by a newer version of SalesTrack.',
  'open-failed': 'Local storage could not be opened on this device, so sales cannot be saved yet.',
  'quota-exceeded': 'This device is out of storage space, so the change was not saved.',
  'transaction-failed': 'That change could not be saved to this device and was rolled back. Try again.',
  'invalid-input': 'That value could not be saved.',
  'not-found': 'That record is no longer on this device.',
  'restore-failed': 'The restore did not complete. Restore from your backup file again.',
  'backup-unreadable': 'The backup could not be verified, so it was not saved. Nothing on this device changed.',
}

// ---------------------------------------------------------------------------
// Date & id helpers
//
// Calendar maths lives in `src/core/date.ts` (architecture invariant #3), so
// the persistence layer delegates rather than carrying a second implementation
// that could drift from the one every screen and calculation uses. Only the
// pieces core/date does not provide are defined here.
// ---------------------------------------------------------------------------

export { isValidIso as isValidIsoDate, todayIso } from '../core/date'

const ISO_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** @internal core/date has no time validator; sales carry an 'HH:mm' field. */
export function isValidIsoTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIME_RE.test(value)
}

/** @internal The calendar day before `date`. Used to close out goal rows. */
export function dayBefore(date: IsoDate): IsoDate {
  return addDays(date, -1)
}

/** @internal UUID with a fallback for non-secure contexts where randomUUID is absent. */
export function newId(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // Last resort. Never expected in a PWA (secure context), but better than throwing.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

// ---------------------------------------------------------------------------
// Defaults — seeded on first open and re-seeded by resetAllData()
// ---------------------------------------------------------------------------

/**
 * Spec §34: neutral starter categories. Deliberately NOT industry-specific —
 * the same three work for lawn care, SaaS or insurance.
 */
export function defaultCategories(now: Millis = Date.now()): Category[] {
  return [
    { id: newId(), name: 'Primary Sale', icon: null, commissionRate: null, active: true, sortOrder: 0, createdAt: now },
    { id: newId(), name: 'Upsell', icon: null, commissionRate: null, active: true, sortOrder: 1, createdAt: now },
    { id: newId(), name: 'Other', icon: null, commissionRate: null, active: true, sortOrder: 2, createdAt: now },
  ]
}

export function defaultSettings(): Settings {
  return {
    currency: 'USD',
    locale: 'en-US',
    workdays: [1, 2, 3, 4, 5],
    excludedDates: [],
    weekStartsOn: 0,
    theme: 'system',
    commissionEnabled: true,
    defaultCommissionRate: 500, // 5% in basis points
    backupReminder: 'monthly',
    lastBackupAt: null,
    reducedMotion: null,
    onboardingCompletedAt: null,
    schemaVersion: SCHEMA_VERSION,
  }
}

export function defaultProfile(now: Millis = Date.now()): AgentProfile {
  return { displayName: '', initials: null, createdAt: now }
}

// ---------------------------------------------------------------------------
// Migrations — APPEND ONLY
//
// Each entry runs when the on-disk version is below its `version`. To add a
// migration: append `{ version: 2, migrate(db, tx) { ... } }` and bump
// DB_VERSION. Never modify an entry that has shipped; a user upgrading from v1
// replays exactly the same steps a fresh install did.
//
// The upgrade callback runs inside a versionchange transaction. Only IndexedDB
// work may happen here — awaiting anything else would let the transaction
// auto-commit mid-migration.
// ---------------------------------------------------------------------------

interface Migration {
  version: number
  migrate: (db: SalesTrackDatabase, tx: MigrationTransaction) => void
}

type MigrationTransaction = IDBPTransaction<SalesTrackDB, StoreNames<SalesTrackDB>[], 'versionchange'>

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    migrate(db, tx) {
      const sales = db.createObjectStore('sales', { keyPath: 'id' })
      sales.createIndex('date', 'date')
      sales.createIndex('status', 'status')
      sales.createIndex('categoryId', 'categoryId')
      sales.createIndex('status-date', ['status', 'date'])

      const categories = db.createObjectStore('categories', { keyPath: 'id' })
      categories.createIndex('sortOrder', 'sortOrder')

      const goals = db.createObjectStore('goals', { keyPath: 'id' })
      goals.createIndex('type-effectiveFrom', ['type', 'effectiveFrom'])

      db.createObjectStore('meta')

      // Seed inside the same versionchange transaction: a first open either
      // yields a complete, usable database or leaves nothing behind.
      const now = Date.now()
      const categoryStore = tx.objectStore('categories')
      for (const category of defaultCategories(now)) categoryStore.put(category)

      const metaStore = tx.objectStore('meta')
      metaStore.put(defaultSettings(), 'settings')
      metaStore.put(defaultProfile(now), 'profile')
      metaStore.put(SCHEMA_VERSION, 'schemaVersion')
    },
  },
]

function runMigrations(db: SalesTrackDatabase, oldVersion: number, tx: MigrationTransaction): void {
  for (const migration of MIGRATIONS) {
    if (oldVersion < migration.version) migration.migrate(db, tx)
  }
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

export interface OpenOptions {
  /** Called when another tab is holding an older version open. */
  onBlocked?: () => void
  /** Called when this connection is asked to close so another tab can upgrade. */
  onBlocking?: () => void
  /** Called when the browser terminates the connection unexpectedly. */
  onTerminated?: () => void
}

let dbPromise: Promise<SalesTrackDatabase> | null = null

/** True when this environment exposes a usable IndexedDB factory. */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    // Some hardened browsers throw on merely touching the property.
    return false
  }
}

/**
 * Open (or return the cached) database connection.
 *
 * Rejects with a `StorageError` carrying a user-facing message rather than a
 * bare DOMException, so the shell can render "SalesTrack can't save on this
 * device" instead of failing quietly.
 */
export function getDB(options: OpenOptions = {}): Promise<SalesTrackDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase(options).catch((err) => {
      // Do not cache a failed open — a retry (user leaves private browsing,
      // closes the other tab) must be able to succeed.
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

async function openDatabase(options: OpenOptions): Promise<SalesTrackDatabase> {
  if (!isIndexedDbAvailable()) {
    throw new StorageError(
      'unavailable',
      'This browser does not allow local storage, so SalesTrack cannot save sales on this device. Private or incognito windows often block it.',
    )
  }

  let opened: SalesTrackDatabase | null = null
  let blockedTimer: ReturnType<typeof setTimeout> | undefined
  let rejectBlocked: ((err: unknown) => void) | undefined
  const blockedSignal = new Promise<never>((_resolve, reject) => {
    rejectBlocked = reject
  })

  let open: Promise<SalesTrackDatabase>
  try {
    open = openDB<SalesTrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        runMigrations(db, oldVersion, tx)
      },
      blocked() {
        options.onBlocked?.()
        // An older connection elsewhere is stalling the upgrade. openDB would
        // simply hang; surface it instead of leaving the user on a dead screen.
        blockedTimer = setTimeout(() => {
          rejectBlocked?.(
            new StorageError(
              'blocked',
              'SalesTrack is open in another tab or window. Close the others, then reload this page.',
            ),
          )
        }, BLOCKED_TIMEOUT_MS)
      },
      blocking() {
        options.onBlocking?.()
        // Another tab wants to upgrade. Let go so it can, and drop the cache so
        // the next read reopens against the new version.
        opened?.close()
        dbPromise = null
      },
      terminated() {
        options.onTerminated?.()
        dbPromise = null
      },
    })
  } catch (err) {
    // Synchronous throw (Firefox private browsing does this).
    throw toStorageError(err, 'unavailable')
  }

  try {
    const db = await Promise.race([open, blockedSignal])
    opened = db
    return db
  } catch (err) {
    // If the blocked timeout won the race, the open may still land later.
    // Close it so we do not leak a connection.
    void open.then((db) => db.close()).catch(() => undefined)
    throw toStorageError(err)
  } finally {
    if (blockedTimer !== undefined) clearTimeout(blockedTimer)
  }
}

/** Close the cached connection. The next call to `getDB()` reopens it. */
export async function closeDatabase(): Promise<void> {
  const pending = dbPromise
  dbPromise = null
  if (!pending) return
  try {
    const db = await pending
    db.close()
  } catch {
    // Nothing to close if the open never succeeded.
  }
}

/**
 * Delete the entire database file. Used only by tests and by the nuclear path
 * of §44; normal resets go through `resetAllData()`, which keeps the schema and
 * re-seeds, so the app never has to survive a missing database mid-session.
 */
export async function destroyDatabase(): Promise<void> {
  await closeDatabase()
  await deleteDB(DB_NAME, {
    blocked() {
      // Another tab is holding it. Nothing useful to do beyond not hanging.
    },
  })
}

// ---------------------------------------------------------------------------
// Typed meta access — the one place casts are allowed
// ---------------------------------------------------------------------------

interface MetaReader {
  get(key: MetaKey): Promise<MetaValue | undefined>
}
interface MetaWriter {
  put(value: MetaValue, key: MetaKey): Promise<unknown>
}

export async function getMeta<K extends MetaKey>(store: MetaReader, key: K): Promise<MetaShape[K] | undefined> {
  const value = await store.get(key)
  return value as MetaShape[K] | undefined
}

/**
 * Returns the request promise. Callers inside a batch must keep it and await it
 * alongside `tx.done` — an unobserved rejection is both a lost error and an
 * unhandled-rejection warning.
 */
export function putMeta<K extends MetaKey>(
  store: MetaWriter,
  key: K,
  value: MetaShape[K],
): Promise<unknown> {
  return store.put(value as MetaValue, key)
}

// ---------------------------------------------------------------------------
// Browser storage environment
// ---------------------------------------------------------------------------

export interface PersistenceStatus {
  /** False when the browser has no Storage Manager (Safari < 15.2, older FF). */
  supported: boolean
  /** True when the origin's storage is exempt from automatic eviction. */
  persisted: boolean
  /** Present when the request could not be made or was declined. */
  reason?: string
}

/**
 * Ask the browser to mark this origin's storage as persistent.
 *
 * Without this, IndexedDB is "best-effort": under storage pressure the browser
 * may evict the whole origin — and with it the user's entire sales history —
 * without asking. Chrome grants persistence silently based on engagement
 * heuristics (installed PWA, bookmarked, high engagement); Firefox prompts;
 * Safari does not honour it at all and instead evicts after ~7 days of no use
 * for non-installed sites. Call this at boot, and keep backups as the real
 * safety net (spec §38).
 */
export async function requestPersistentStorage(): Promise<PersistenceStatus> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!storage || typeof storage.persist !== 'function') {
    return { supported: false, persisted: false, reason: 'This browser cannot protect local storage from cleanup.' }
  }
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) {
      return { supported: true, persisted: true }
    }
    const granted = await storage.persist()
    return granted
      ? { supported: true, persisted: true }
      : {
          supported: true,
          persisted: false,
          reason: 'The browser may clear this data if the device runs low on space. Create backups regularly.',
        }
  } catch (err) {
    return { supported: true, persisted: false, reason: String(err) }
  }
}

export interface StorageEstimateResult {
  supported: boolean
  usageBytes: number | null
  quotaBytes: number | null
  /** usage / quota, 0-1. Null when either figure is unavailable. */
  usedFraction: number | null
  persisted: boolean
}

/** Best-effort disk figures for the Storage Health panel (spec §42). */
export async function storageEstimate(): Promise<StorageEstimateResult> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!storage || typeof storage.estimate !== 'function') {
    return { supported: false, usageBytes: null, quotaBytes: null, usedFraction: null, persisted: false }
  }
  try {
    const estimate = await storage.estimate()
    const usage = typeof estimate.usage === 'number' ? estimate.usage : null
    const quota = typeof estimate.quota === 'number' ? estimate.quota : null
    const persisted = typeof storage.persisted === 'function' ? await storage.persisted() : false
    return {
      supported: true,
      usageBytes: usage,
      quotaBytes: quota,
      usedFraction: usage !== null && quota !== null && quota > 0 ? usage / quota : null,
      persisted,
    }
  } catch {
    return { supported: false, usageBytes: null, quotaBytes: null, usedFraction: null, persisted: false }
  }
}

/**
 * @internal Save a generated text file to the user's device.
 *
 * Shared by backup.ts and csv.ts. Creates a Blob, clicks a synthetic anchor and
 * revokes the object URL afterwards so the blob can be garbage collected —
 * these files can be megabytes and a leaked URL pins them for the session.
 */
export function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new StorageError('unavailable', 'This browser cannot save files from SalesTrack.')
  }
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // Give the browser a tick to start the download before releasing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

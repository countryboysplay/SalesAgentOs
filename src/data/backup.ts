/**
 * SalesTrack — backup, restore, reset and storage health (spec §38-§40, §42, §44).
 *
 * There is no server. A backup file is the ONLY copy of the user's sales
 * history that can survive losing the device, clearing site data, or a browser
 * evicting the origin. That makes this module a core feature, not a utility.
 *
 * Two rules shape everything below:
 *
 *  1. Never trust a file. `readBackupFile` treats its input as hostile: wrong
 *     format, wrong version, a future version, malformed records and duplicate
 *     ids are all rejected with a sentence the user can act on.
 *  2. Restore is replace-only and atomic (§40 rules out merging in v1). The
 *     wipe and the repopulate share ONE IndexedDB transaction, so a failure
 *     halfway through rolls the whole thing back — the user cannot end up with
 *     half of last month's sales. A pre-flight in-memory snapshot covers the
 *     rarer case where the transaction commits but a later step fails.
 */

import {
  ALL_STORES,
  StorageError,
  defaultCategories,
  defaultProfile,
  defaultSettings,
  downloadTextFile,
  getDB,
  isValidIsoDate,
  isValidIsoTime,
  putMeta,
  SCHEMA_VERSION,
  storageEstimate,
  todayIso,
  toStorageError,
  type StorageEstimateResult,
} from './db'
import { loadAll, saveSettings, type AppData } from './repository'
import type {
  AgentProfile,
  BackupFile,
  BackupReminder,
  BackupSummary,
  Category,
  Goal,
  GoalType,
  IsoDate,
  Millis,
  Sale,
  SaleStatus,
  Settings,
  ThemePreference,
  Weekday,
} from '../core/types'

export const BACKUP_FORMAT = 'salestrack-backup'

/** Bump only when the envelope shape changes; readers accept <= this. */
export const BACKUP_VERSION = 1

export const APP_VERSION = '1.0.0'

/** Refuse to parse anything implausibly large before we try to JSON.parse it. */
const MAX_BACKUP_BYTES = 64 * 1024 * 1024

const SALE_STATUSES: readonly SaleStatus[] = ['active', 'cancelled', 'adjusted']
const GOAL_TYPES: readonly GoalType[] = ['daily', 'monthly', 'annual']
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark']
const REMINDERS: readonly BackupReminder[] = ['off', 'weekly', 'monthly']

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export class BackupValidationError extends Error {
  /** Every problem found, so the UI can show more than the first one. */
  readonly issues: string[]
  /** Plain-language sentence safe to render directly. */
  readonly userMessage: string

  constructor(userMessage: string, issues: string[] = []) {
    super(issues.length > 0 ? `${userMessage} (${issues.join('; ')})` : userMessage)
    this.name = 'BackupValidationError'
    this.userMessage = userMessage
    this.issues = issues
  }
}

export function isBackupValidationError(value: unknown): value is BackupValidationError {
  return value instanceof BackupValidationError
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** Filename for a backup taken on `date`. Spec §39: SalesTrack-Backup-2026-09-04. */
export function backupFilename(date: IsoDate = todayIso()): string {
  return `SalesTrack-Backup-${date}.json`
}

/** Read everything currently on this device into a portable envelope (§39). */
export async function createBackup(): Promise<BackupFile> {
  const data = await loadAll()
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    app: { name: 'SalesTrack', version: APP_VERSION },
    data: {
      profile: data.profile,
      settings: data.settings,
      sales: data.sales,
      categories: data.categories,
      goals: data.goals,
    },
  }
}

/** Pretty-printed so a worried user can open the file and see their sales. */
export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

export interface DownloadResult {
  filename: string
  createdAt: Millis
  saleCount: number
  bytes: number
}

/**
 * Hand a backup file to the browser.
 *
 * This deliberately does NOT stamp `lastBackupAt`. A browser cannot tell us
 * whether the user actually kept the file — they may cancel the save dialog,
 * and some mobile browsers drop the download silently. Stamping here would let
 * the app report "Backed up today" over a backup that never landed and stop
 * reminding them, which is the most dangerous lie this product could tell:
 * the file is the only copy of the data.
 *
 * So the caller must confirm with the user and then call `markBackupCreated`.
 * See §42/§43 — Storage Health and the reminder both read that timestamp.
 */
export async function downloadBackup(): Promise<DownloadResult> {
  const backup = await createBackup()
  const contents = serializeBackup(backup)
  const filename = backupFilename(todayIso(new Date(backup.createdAt)))

  // Verify the file we are about to hand over can be read back before the user
  // starts relying on it. A backup that fails to parse is worse than none,
  // because it is indistinguishable from a good one until the day it is needed.
  verifyRoundTrip(contents, backup)

  downloadTextFile(filename, contents, 'application/json')

  return {
    filename,
    createdAt: backup.createdAt,
    saleCount: backup.data.sales.length,
    bytes: contents.length,
  }
}

/**
 * Re-parse a serialized backup and check it still describes the same ledger.
 * Cheap insurance against a serialisation defect shipping silently.
 */
function verifyRoundTrip(contents: string, source: BackupFile): void {
  let parsed: BackupFile
  try {
    parsed = parseBackup(contents)
  } catch (cause) {
    throw new StorageError(
      'backup-unreadable',
      'The backup was built but could not be read back, so it was not saved. Your sales history on this device is unchanged.',
      { cause },
    )
  }

  const sameShape =
    parsed.data.sales.length === source.data.sales.length &&
    parsed.data.goals.length === source.data.goals.length &&
    parsed.data.categories.length === source.data.categories.length

  if (!sameShape) {
    throw new StorageError(
      'backup-unreadable',
      'The backup did not verify correctly, so it was not saved. Your sales history on this device is unchanged.',
    )
  }
}

/**
 * Stamp `lastBackupAt` onto settings — call this only once the user has
 * confirmed the file actually saved (see `downloadBackup`).
 */
export async function markBackupCreated(at: Millis = Date.now(), settings?: Settings): Promise<Settings> {
  const current = settings ?? (await loadAll()).settings
  return saveSettings({ ...current, lastBackupAt: at })
}

// ---------------------------------------------------------------------------
// Read & validate — assume the file is hostile
// ---------------------------------------------------------------------------

/**
 * Parse and fully validate a file the user picked. Never returns a partially
 * trusted object: either the result is a well-formed `BackupFile` or this
 * throws a `BackupValidationError` carrying readable reasons.
 */
export async function readBackupFile(file: File): Promise<BackupFile> {
  if (!file) throw new BackupValidationError('No file was selected.')

  const size = typeof file.size === 'number' ? file.size : 0
  if (size > MAX_BACKUP_BYTES) {
    throw new BackupValidationError('That file is too large to be a SalesTrack backup.')
  }
  if (size === 0) {
    throw new BackupValidationError('That file is empty, so there is nothing to restore.')
  }

  let text: string
  try {
    text = await readFileText(file)
  } catch (err) {
    throw new BackupValidationError('That file could not be read from this device.', [String(err)])
  }

  return parseBackup(text)
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupValidationError(
      "That file isn't a SalesTrack backup. Choose the .json file created by Create Backup.",
    )
  }
  return validateBackup(raw)
}

/**
 * The real gate. Structure first, then every record.
 *
 * Sales are validated strictly — a malformed sale is a data-integrity problem
 * and silently dropping one would be worse than refusing the file. Settings and
 * the profile are normalised against defaults instead, because a missing
 * preference is harmless and should never block a user from getting their sales
 * history back.
 */
export function validateBackup(raw: unknown): BackupFile {
  if (!isRecord(raw)) {
    throw new BackupValidationError("That file isn't a SalesTrack backup.")
  }

  if (raw.format !== BACKUP_FORMAT) {
    throw new BackupValidationError(
      "That file isn't a SalesTrack backup. Choose the .json file created by Create Backup.",
    )
  }

  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BackupValidationError('That backup file has no readable version number, so it cannot be restored.')
  }
  if (version > BACKUP_VERSION) {
    throw new BackupValidationError(
      'That backup was created by a newer version of SalesTrack. Update the app, then restore it.',
    )
  }

  const createdAt = raw.createdAt
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt <= 0) {
    throw new BackupValidationError('That backup file has no readable creation date, so it cannot be restored.')
  }

  const data = raw.data
  if (!isRecord(data)) {
    throw new BackupValidationError('That backup file has no data in it.')
  }
  if (!Array.isArray(data.sales) || !Array.isArray(data.categories) || !Array.isArray(data.goals)) {
    throw new BackupValidationError('That backup file is missing its sales, categories or goals.')
  }

  const issues: string[] = []
  const categories = data.categories.map((c, i) => validateCategory(c, i, createdAt, issues))
  const goals = data.goals.map((g, i) => validateGoal(g, i, createdAt, issues))
  const sales = data.sales.map((s, i) => validateSale(s, i, issues))

  assertUniqueIds(sales, 'sale', issues)
  assertUniqueIds(categories, 'category', issues)
  assertUniqueIds(goals, 'goal', issues)

  if (issues.length > 0) {
    throw new BackupValidationError(
      `That backup file has ${issues.length} damaged ${issues.length === 1 ? 'record' : 'records'} and was not restored, so nothing on this device changed.`,
      summariseIssues(issues),
    )
  }

  const settings = normaliseSettings(data.settings)
  const profile = normaliseProfile(data.profile, createdAt)

  const app = isRecord(raw.app) ? raw.app : {}
  const appVersion = typeof app.version === 'string' ? app.version : APP_VERSION

  return {
    format: BACKUP_FORMAT,
    version,
    createdAt,
    app: { name: 'SalesTrack', version: appVersion },
    data: { profile, settings, sales, categories, goals },
  }
}

function summariseIssues(issues: string[]): string[] {
  if (issues.length <= 5) return issues
  return [...issues.slice(0, 5), `and ${issues.length - 5} more`]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
}

function assertUniqueIds(records: { id: string }[], label: string, issues: string[]): void {
  const seen = new Set<string>()
  for (const record of records) {
    // Blank ids belong to records that already failed validation. Counting them
    // again as duplicates would inflate the "N damaged records" figure the user
    // is shown.
    if (record.id === '') continue
    if (seen.has(record.id)) issues.push(`duplicate ${label} id ${record.id}`)
    seen.add(record.id)
  }
}

function validateSale(raw: unknown, index: number, issues: string[]): Sale {
  const where = `sale ${index + 1}`
  if (!isRecord(raw)) {
    issues.push(`${where} is not a record`)
    return placeholderSale()
  }

  const problems: string[] = []
  if (typeof raw.id !== 'string' || raw.id.length === 0) problems.push('missing id')
  if (!isWholeNumber(raw.amount) || (raw.amount as number) < 0) problems.push('amount is not whole cents')
  if (!isValidIsoDate(raw.date)) problems.push('date is not YYYY-MM-DD')
  if (!isValidIsoTime(raw.time)) problems.push('time is not HH:mm')
  if (raw.categoryId !== null && typeof raw.categoryId !== 'string') problems.push('category is not valid')
  if (!isWholeNumber(raw.commissionRate) || (raw.commissionRate as number) < 0) {
    problems.push('commission rate is not basis points')
  }
  if (!isWholeNumber(raw.commissionAmount) || (raw.commissionAmount as number) < 0) {
    problems.push('commission amount is not whole cents')
  }
  if (raw.note !== null && typeof raw.note !== 'string') problems.push('note is not text')
  if (!SALE_STATUSES.includes(raw.status as SaleStatus)) problems.push('status is not recognised')
  if (typeof raw.createdAt !== 'number' || !Number.isFinite(raw.createdAt)) problems.push('created date is missing')
  if (typeof raw.modifiedAt !== 'number' || !Number.isFinite(raw.modifiedAt)) problems.push('modified date is missing')
  if (raw.adjustedAmount !== null && raw.adjustedAmount !== undefined && !isWholeNumber(raw.adjustedAmount)) {
    problems.push('adjusted amount is not whole cents')
  }

  const cancellation = validateCancellation(raw, problems)

  if (problems.length > 0) {
    issues.push(`${where}: ${problems.join(', ')}`)
    return placeholderSale()
  }

  return {
    id: raw.id as string,
    amount: raw.amount as number,
    date: raw.date as IsoDate,
    time: raw.time as string,
    categoryId: raw.categoryId as string | null,
    commissionRate: raw.commissionRate as number,
    commissionAmount: raw.commissionAmount as number,
    note: (raw.note ?? null) as string | null,
    status: raw.status as SaleStatus,
    createdAt: raw.createdAt as number,
    modifiedAt: raw.modifiedAt as number,
    cancellation,
    adjustedAmount: (raw.adjustedAmount ?? null) as number | null,
  }
}

function validateCancellation(raw: Record<string, unknown>, problems: string[]): Sale['cancellation'] {
  const value = raw.cancellation
  if (value === null || value === undefined) {
    if (raw.status === 'cancelled') problems.push('cancelled sale has no cancellation details')
    return null
  }
  if (!isRecord(value)) {
    problems.push('cancellation details are not a record')
    return null
  }
  if (!isValidIsoDate(value.cancelledOn)) {
    problems.push('cancellation date is not YYYY-MM-DD')
    return null
  }
  if (value.reason !== null && value.reason !== undefined && typeof value.reason !== 'string') {
    problems.push('cancellation reason is not text')
    return null
  }
  return {
    cancelledOn: value.cancelledOn as IsoDate,
    reason: (value.reason ?? null) as string | null,
    cancelledAt: typeof value.cancelledAt === 'number' ? value.cancelledAt : 0,
  }
}

function placeholderSale(): Sale {
  // Never persisted — validation throws before any placeholder reaches the DB.
  return {
    id: '',
    amount: 0,
    date: '1970-01-01',
    time: '00:00',
    categoryId: null,
    commissionRate: 0,
    commissionAmount: 0,
    note: null,
    status: 'active',
    createdAt: 0,
    modifiedAt: 0,
    cancellation: null,
    adjustedAmount: null,
  }
}

function validateCategory(raw: unknown, index: number, fallbackCreatedAt: Millis, issues: string[]): Category {
  const where = `category ${index + 1}`
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) {
    issues.push(`${where} is missing an id`)
    return { id: '', name: '', icon: null, commissionRate: null, active: true, sortOrder: index, createdAt: 0 }
  }
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    issues.push(`${where} is missing a name`)
  }
  if (raw.commissionRate !== null && raw.commissionRate !== undefined && !isWholeNumber(raw.commissionRate)) {
    issues.push(`${where} has an invalid commission rate`)
  }
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    icon: typeof raw.icon === 'string' ? raw.icon : null,
    commissionRate: isWholeNumber(raw.commissionRate) ? raw.commissionRate : null,
    active: typeof raw.active === 'boolean' ? raw.active : true,
    sortOrder: isWholeNumber(raw.sortOrder) ? raw.sortOrder : index,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : fallbackCreatedAt,
  }
}

function validateGoal(raw: unknown, index: number, fallbackCreatedAt: Millis, issues: string[]): Goal {
  const where = `goal ${index + 1}`
  const blank: Goal = {
    id: '',
    type: 'monthly',
    amount: 0,
    effectiveFrom: '1970-01-01',
    effectiveTo: null,
    enabled: false,
    createdAt: 0,
  }
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) {
    issues.push(`${where} is missing an id`)
    return blank
  }
  const problems: string[] = []
  if (!GOAL_TYPES.includes(raw.type as GoalType)) problems.push('goal type is not recognised')
  if (!isWholeNumber(raw.amount) || (raw.amount as number) < 0) problems.push('amount is not whole cents')
  if (!isValidIsoDate(raw.effectiveFrom)) problems.push('start date is not YYYY-MM-DD')
  if (raw.effectiveTo !== null && raw.effectiveTo !== undefined && !isValidIsoDate(raw.effectiveTo)) {
    problems.push('end date is not YYYY-MM-DD')
  }
  if (problems.length > 0) {
    issues.push(`${where}: ${problems.join(', ')}`)
    return blank
  }
  return {
    id: raw.id,
    type: raw.type as GoalType,
    amount: raw.amount as number,
    effectiveFrom: raw.effectiveFrom as IsoDate,
    effectiveTo: (raw.effectiveTo ?? null) as IsoDate | null,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : fallbackCreatedAt,
  }
}

/**
 * Settings are merged over defaults rather than rejected. A backup from a build
 * that did not have `reducedMotion` yet must still restore its sales.
 */
function normaliseSettings(raw: unknown): Settings {
  const base = defaultSettings()
  if (!isRecord(raw)) return base

  const workdays = Array.isArray(raw.workdays)
    ? raw.workdays.filter((d): d is Weekday => isWholeNumber(d) && d >= 0 && d <= 6)
    : base.workdays
  const excludedDates = Array.isArray(raw.excludedDates)
    ? raw.excludedDates.filter((d): d is IsoDate => isValidIsoDate(d))
    : base.excludedDates

  return {
    currency: typeof raw.currency === 'string' && raw.currency.length === 3 ? raw.currency : base.currency,
    locale: typeof raw.locale === 'string' && raw.locale.length > 0 ? raw.locale : base.locale,
    workdays: workdays.length > 0 ? workdays : base.workdays,
    excludedDates,
    weekStartsOn:
      isWholeNumber(raw.weekStartsOn) && raw.weekStartsOn >= 0 && raw.weekStartsOn <= 6
        ? (raw.weekStartsOn as Weekday)
        : base.weekStartsOn,
    theme: THEMES.includes(raw.theme as ThemePreference) ? (raw.theme as ThemePreference) : base.theme,
    commissionEnabled: typeof raw.commissionEnabled === 'boolean' ? raw.commissionEnabled : base.commissionEnabled,
    defaultCommissionRate:
      isWholeNumber(raw.defaultCommissionRate) && raw.defaultCommissionRate >= 0
        ? raw.defaultCommissionRate
        : base.defaultCommissionRate,
    backupReminder: REMINDERS.includes(raw.backupReminder as BackupReminder)
      ? (raw.backupReminder as BackupReminder)
      : base.backupReminder,
    lastBackupAt: typeof raw.lastBackupAt === 'number' ? raw.lastBackupAt : null,
    reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : null,
    onboardingCompletedAt: typeof raw.onboardingCompletedAt === 'number' ? raw.onboardingCompletedAt : null,
    schemaVersion: isWholeNumber(raw.schemaVersion) ? raw.schemaVersion : SCHEMA_VERSION,
  }
}

function normaliseProfile(raw: unknown, fallbackCreatedAt: Millis): AgentProfile {
  const base = defaultProfile(fallbackCreatedAt)
  if (!isRecord(raw)) return base
  return {
    displayName: typeof raw.displayName === 'string' ? raw.displayName : base.displayName,
    initials: typeof raw.initials === 'string' ? raw.initials : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : base.createdAt,
  }
}

// ---------------------------------------------------------------------------
// Summary — the restore confirmation screen (§40)
// ---------------------------------------------------------------------------

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const sales = backup.data.sales
  let from: IsoDate | null = null
  let to: IsoDate | null = null

  for (const sale of sales) {
    if (from === null || sale.date < from) from = sale.date
    if (to === null || sale.date > to) to = sale.date
  }

  return {
    createdAt: backup.createdAt,
    saleCount: sales.length,
    dateRange: from !== null && to !== null ? { from, to } : null,
    goalCount: backup.data.goals.length,
    categoryCount: backup.data.categories.length,
  }
}

// ---------------------------------------------------------------------------
// Restore — replace-only, atomic (§40)
// ---------------------------------------------------------------------------

export interface RestoreResult {
  salesRestored: number
  categoriesRestored: number
  goalsRestored: number
  /** True when a failed restore had to be rolled back from the snapshot. */
  rolledBack: boolean
}

/**
 * Replace everything on this device with the contents of `backup`.
 *
 * Atomicity, in two layers:
 *
 *  1. The clear and every put share a SINGLE readwrite transaction spanning all
 *     four stores. Requests are queued in one tick — nothing non-IndexedDB is
 *     awaited in between, which would let the transaction auto-commit early.
 *     If any request fails, IndexedDB aborts and the database is left exactly
 *     as it was. A half-restored database is not reachable.
 *  2. Before touching anything, the current contents are snapshotted in memory.
 *     If the transaction commits and something afterwards still goes wrong, the
 *     snapshot is written back. If even that fails we raise `restore-failed`
 *     and tell the user to restore from the file again, because at that point
 *     the file is the trustworthy copy.
 */
export async function restoreBackup(backup: BackupFile): Promise<RestoreResult> {
  // Re-validate: this may be an object built in memory rather than one that
  // came through readBackupFile.
  const validated = validateBackup(backup)

  const snapshot = await snapshotCurrentData()

  try {
    await replaceAll(validated.data)
  } catch (err) {
    const rolledBack = await rollback(snapshot)
    if (!rolledBack) {
      throw new StorageError(
        'restore-failed',
        'The restore failed and this device could not be returned to its previous state. Restore from your backup file again.',
        { cause: err },
      )
    }
    throw toStorageError(err, 'transaction-failed')
  }

  return {
    salesRestored: validated.data.sales.length,
    categoriesRestored: validated.data.categories.length,
    goalsRestored: validated.data.goals.length,
    rolledBack: false,
  }
}

async function snapshotCurrentData(): Promise<AppData> {
  try {
    return await loadAll()
  } catch {
    // A database too damaged to read has nothing worth rolling back to.
    return {
      profile: defaultProfile(),
      settings: defaultSettings(),
      sales: [],
      categories: [],
      goals: [],
    }
  }
}

async function rollback(snapshot: AppData): Promise<boolean> {
  try {
    await replaceAll(snapshot)
    return true
  } catch {
    return false
  }
}

/** The single transaction that wipes and repopulates every store. */
async function replaceAll(data: AppData | BackupFile['data']): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([...ALL_STORES], 'readwrite')

  const sales = tx.objectStore('sales')
  const categories = tx.objectStore('categories')
  const goals = tx.objectStore('goals')
  const meta = tx.objectStore('meta')

  // Every request below is issued synchronously, in one tick, so the
  // transaction cannot auto-commit part way through.
  const ops: Promise<unknown>[] = [sales.clear(), categories.clear(), goals.clear(), meta.clear()]

  for (const sale of data.sales) ops.push(sales.put(sale))
  for (const category of data.categories) ops.push(categories.put(category))
  for (const goal of data.goals) ops.push(goals.put(goal))

  ops.push(putMeta(meta, 'profile', data.profile))
  ops.push(putMeta(meta, 'settings', data.settings))
  ops.push(putMeta(meta, 'schemaVersion', SCHEMA_VERSION))

  try {
    await Promise.all([...ops, tx.done])
  } catch (err) {
    throw toStorageError(err, 'transaction-failed')
  }
}

// ---------------------------------------------------------------------------
// Reset (§44)
// ---------------------------------------------------------------------------

export interface ResetResult {
  profile: AgentProfile
  settings: Settings
  categories: Category[]
}

/**
 * Delete everything on this device and re-seed the defaults, in one
 * transaction. The schema itself is left in place, so the app stays usable
 * immediately afterwards rather than needing a reload.
 *
 * The UI must gate this behind the typed DELETE confirmation from §44.
 */
export async function resetAllData(): Promise<ResetResult> {
  const now = Date.now()
  const fresh: AppData = {
    profile: defaultProfile(now),
    settings: defaultSettings(),
    sales: [],
    categories: defaultCategories(now),
    goals: [],
  }
  await replaceAll(fresh)
  return { profile: fresh.profile, settings: fresh.settings, categories: fresh.categories }
}

// ---------------------------------------------------------------------------
// Storage health (§42)
// ---------------------------------------------------------------------------

export interface StorageHealth {
  saleCount: number
  dateRange: { from: IsoDate; to: IsoDate } | null
  lastBackupAt: Millis | null
  /** Days since the last backup, or null if there has never been one. */
  daysSinceBackup: number | null
  estimate: StorageEstimateResult
}

export async function storageHealth(): Promise<StorageHealth> {
  const db = await getDB()
  const tx = db.transaction(['sales', 'meta'], 'readonly')
  const index = tx.objectStore('sales').index('date')

  const [saleCount, first, last, settings] = await Promise.all([
    tx.objectStore('sales').count(),
    index.openCursor(null, 'next'),
    index.openCursor(null, 'prev'),
    tx.objectStore('meta').get('settings'),
  ])
  await tx.done

  const dateRange = first && last ? { from: first.value.date, to: last.value.date } : null
  const lastBackupAt = isRecord(settings) && typeof settings.lastBackupAt === 'number' ? settings.lastBackupAt : null

  return {
    saleCount,
    dateRange,
    lastBackupAt,
    daysSinceBackup: lastBackupAt === null ? null : Math.floor((Date.now() - lastBackupAt) / 86_400_000),
    estimate: await storageEstimate(),
  }
}

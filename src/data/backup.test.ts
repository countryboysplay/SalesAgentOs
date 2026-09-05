/**
 * Backup, restore, reset and storage health — spec §38-§40, §42, §44, §77.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeDatabase, destroyDatabase } from './db'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupValidationError,
  backupFilename,
  createBackup,
  markBackupCreated,
  parseBackup,
  readBackupFile,
  resetAllData,
  restoreBackup,
  serializeBackup,
  storageHealth,
  summarizeBackup,
  validateBackup,
} from './backup'
import { cancelSale, createCategory, createSale, loadAll, saveProfile, saveSettings, setGoal } from './repository'
import type { BackupFile } from '../core/types'

beforeEach(async () => {
  await destroyDatabase()
})

afterEach(async () => {
  await closeDatabase()
})

/** A device with a bit of everything on it. */
async function seedDevice() {
  const { settings, categories } = await loadAll()

  const custom = await createCategory({ name: 'Aeration', icon: '🌱', commissionRate: 300 })
  const all = [...categories, custom]

  const a = await createSale(
    { amount: 50_000, date: '2026-01-03', time: '09:15', categoryId: categories[0].id, note: 'First of the year' },
    settings,
    all,
  )
  const b = await createSale(
    { amount: 128_950, date: '2026-02-17', time: '16:40', categoryId: custom.id, note: 'Quote: "spring, please"' },
    settings,
    all,
  )
  const c = await createSale({ amount: 7_500, date: '2026-03-01', time: '11:00' }, settings, all)
  await cancelSale(c.id, 'Payment failed', '2026-03-04')

  await setGoal('monthly', 800_000, '2026-01-01')
  await setGoal('monthly', 1_000_000, '2026-02-01')
  await setGoal('daily', 40_000, '2026-01-01')

  const savedSettings = await saveSettings({ ...settings, currency: 'CAD', defaultCommissionRate: 450 })
  const profile = await saveProfile({ displayName: 'Jordan Lee', initials: 'JL', createdAt: 1_700_000_000_000 })

  return { a, b, c, custom, settings: savedSettings, profile }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

describe('createBackup', () => {
  it('captures everything on the device in a portable envelope (§39)', async () => {
    await seedDevice()
    const backup = await createBackup()

    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(backup.app.name).toBe('SalesTrack')
    expect(backup.createdAt).toBeGreaterThan(0)
    expect(backup.data.sales).toHaveLength(3)
    expect(backup.data.categories).toHaveLength(4)
    expect(backup.data.goals).toHaveLength(3)
    expect(backup.data.settings.currency).toBe('CAD')
    expect(backup.data.profile.displayName).toBe('Jordan Lee')
  })

  it('names the file SalesTrack-Backup-YYYY-MM-DD.json (§39)', () => {
    expect(backupFilename('2026-09-04')).toBe('SalesTrack-Backup-2026-09-04.json')
  })

  it('serializes to JSON that parses straight back', async () => {
    await seedDevice()
    const backup = await createBackup()
    const text = serializeBackup(backup)

    expect(text).toContain('"salestrack-backup"')
    expect(parseBackup(text)).toEqual(backup)
  })

  it('records when the last backup happened, for Storage Health (§42)', async () => {
    await seedDevice()
    expect((await storageHealth()).lastBackupAt).toBeNull()

    await markBackupCreated(1_760_000_000_000)

    const health = await storageHealth()
    expect(health.lastBackupAt).toBe(1_760_000_000_000)
    expect(health.saleCount).toBe(3)
    expect(health.dateRange).toEqual({ from: '2026-01-03', to: '2026-03-01' })
    expect(health.daysSinceBackup).toBeGreaterThanOrEqual(0)
  })
})

describe('summarizeBackup', () => {
  it('produces the restore confirmation figures (§40)', async () => {
    await seedDevice()
    const summary = summarizeBackup(await createBackup())

    expect(summary.saleCount).toBe(3)
    expect(summary.dateRange).toEqual({ from: '2026-01-03', to: '2026-03-01' })
    expect(summary.goalCount).toBe(3)
    expect(summary.categoryCount).toBe(4)
  })

  it('handles an empty device without inventing a date range', async () => {
    const summary = summarizeBackup(await createBackup())
    expect(summary.saleCount).toBe(0)
    expect(summary.dateRange).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// §77 Backup Test
// ---------------------------------------------------------------------------

describe('§77 Backup Test', () => {
  it('sales, goals, categories and settings all return after a reset and restore', async () => {
    await seedDevice()
    const before = await loadAll()
    const backup = await createBackup()

    // "Delete local application data."
    await resetAllData()
    const wiped = await loadAll()
    expect(wiped.sales).toEqual([])
    expect(wiped.goals).toEqual([])
    expect(wiped.categories.map((c) => c.name)).toEqual(['Primary Sale', 'Upsell', 'Other'])
    expect(wiped.settings.currency).toBe('USD')
    expect(wiped.profile.displayName).toBe('')

    // "Restore backup."
    const result = await restoreBackup(backup)
    expect(result).toEqual({ salesRestored: 3, categoriesRestored: 4, goalsRestored: 3, rolledBack: false })

    const after = await loadAll()
    expect(JSON.stringify(after.sales)).toBe(JSON.stringify(before.sales))
    expect(JSON.stringify(after.categories)).toBe(JSON.stringify(before.categories))
    expect(JSON.stringify(after.goals)).toBe(JSON.stringify(before.goals))
    expect(after.settings).toEqual(before.settings)
    expect(after.profile).toEqual(before.profile)
  })

  it('survives a round trip through the serialized file, not just the object', async () => {
    await seedDevice()
    const before = await loadAll()
    const text = serializeBackup(await createBackup())

    await resetAllData()

    const file = new File([text], 'SalesTrack-Backup-2026-09-04.json', { type: 'application/json' })
    const parsed = await readBackupFile(file)
    await restoreBackup(parsed)

    const after = await loadAll()
    expect(JSON.stringify(after.sales)).toBe(JSON.stringify(before.sales))
    expect(after.settings).toEqual(before.settings)
  })

  it('is replace-only: restoring does not merge with what is already there (§40)', async () => {
    const { settings, categories } = await loadAll()
    await createSale({ amount: 1_000, date: '2026-01-01', time: '08:00' }, settings, categories)
    const backup = await createBackup()

    // Add more sales after taking the backup.
    await createSale({ amount: 2_000, date: '2026-01-02', time: '08:00' }, settings, categories)
    await createSale({ amount: 3_000, date: '2026-01-03', time: '08:00' }, settings, categories)
    expect((await loadAll()).sales).toHaveLength(3)

    await restoreBackup(backup)

    const after = await loadAll()
    expect(after.sales).toHaveLength(1)
    expect(after.sales[0].amount).toBe(1_000)
  })

  it('a cancelled sale comes back cancelled, with its original amount', async () => {
    const { c } = await seedDevice()
    const backup = await createBackup()
    await resetAllData()
    await restoreBackup(backup)

    const restored = (await loadAll()).sales.find((s) => s.id === c.id)
    expect(restored?.status).toBe('cancelled')
    expect(restored?.amount).toBe(7_500)
    expect(restored?.cancellation).toMatchObject({ cancelledOn: '2026-03-04', reason: 'Payment failed' })
  })
})

// ---------------------------------------------------------------------------
// Reset (§44)
// ---------------------------------------------------------------------------

describe('resetAllData', () => {
  it('deletes everything and re-seeds usable defaults', async () => {
    await seedDevice()

    const result = await resetAllData()
    expect(result.categories).toHaveLength(3)

    const after = await loadAll()
    expect(after.sales).toEqual([])
    expect(after.goals).toEqual([])
    expect(after.settings.defaultCommissionRate).toBe(500)

    // The app is immediately usable — no reload needed.
    const sale = await createSale(
      { amount: 5_000, date: '2026-07-01', time: '09:00', categoryId: after.categories[0].id },
      after.settings,
      after.categories,
    )
    expect(sale.id).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Validation — do not trust the file
// ---------------------------------------------------------------------------

describe('malformed backup rejection', () => {
  async function goodBackup(): Promise<BackupFile> {
    await seedDevice()
    return createBackup()
  }

  function expectRejection(value: unknown, pattern: RegExp) {
    let thrown: unknown
    try {
      validateBackup(value)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(BackupValidationError)
    expect((thrown as BackupValidationError).userMessage).toMatch(pattern)
  }

  it('rejects things that are not JSON at all', () => {
    expect(() => parseBackup('not json {{{')).toThrow(BackupValidationError)
    expect(() => parseBackup('')).toThrow(BackupValidationError)
  })

  it('rejects a foreign JSON file', () => {
    expectRejection({ hello: 'world' }, /isn't a SalesTrack backup/i)
    expectRejection([1, 2, 3], /isn't a SalesTrack backup/i)
    expectRejection(null, /isn't a SalesTrack backup/i)
    expectRejection({ format: 'some-other-app', version: 1 }, /isn't a SalesTrack backup/i)
  })

  it('rejects a backup from a newer version of the app', async () => {
    const backup = await goodBackup()
    expectRejection({ ...backup, version: BACKUP_VERSION + 1 }, /newer version/i)
  })

  it('rejects a missing or nonsense version', async () => {
    const backup = await goodBackup()
    expectRejection({ ...backup, version: 0 }, /version number/i)
    expectRejection({ ...backup, version: '1' }, /version number/i)
    expectRejection({ ...backup, version: 1.5 }, /version number/i)
  })

  it('rejects a missing creation date', async () => {
    const backup = await goodBackup()
    expectRejection({ ...backup, createdAt: 'yesterday' }, /creation date/i)
    expectRejection({ ...backup, createdAt: 0 }, /creation date/i)
  })

  it('rejects a backup with no data block', async () => {
    const backup = await goodBackup()
    expectRejection({ ...backup, data: null }, /no data in it/i)
    expectRejection({ ...backup, data: { ...backup.data, sales: 'lots' } }, /missing its sales/i)
  })

  it('rejects malformed sale records and says how many', async () => {
    const backup = await goodBackup()
    const damaged = {
      ...backup,
      data: {
        ...backup.data,
        sales: [
          { ...backup.data.sales[0], amount: 12.5 },
          { ...backup.data.sales[1], date: '2026-02-31' },
          { ...backup.data.sales[2], status: 'refunded' },
        ],
      },
    }
    expectRejection(damaged, /3 damaged records/i)
  })

  it('rejects a cancelled sale with no cancellation details', async () => {
    const backup = await goodBackup()
    const sale = backup.data.sales.find((s) => s.status === 'cancelled')!
    expectRejection(
      { ...backup, data: { ...backup.data, sales: [{ ...sale, cancellation: null }] } },
      /damaged record/i,
    )
  })

  it('rejects duplicate ids, which would silently drop a sale on restore', async () => {
    const backup = await goodBackup()
    const duplicate = { ...backup.data.sales[0] }
    expectRejection(
      { ...backup, data: { ...backup.data, sales: [...backup.data.sales, duplicate] } },
      /damaged record/i,
    )
  })

  it('rejects malformed goals rather than corrupting goal history', async () => {
    const backup = await goodBackup()
    expectRejection(
      {
        ...backup,
        data: { ...backup.data, goals: [{ ...backup.data.goals[0], effectiveFrom: 'January' }] },
      },
      /damaged record/i,
    )
  })

  it('leaves the device untouched when a file is rejected', async () => {
    await seedDevice()
    const before = await loadAll()

    await expect(restoreBackup({ format: 'nope' } as unknown as BackupFile)).rejects.toBeInstanceOf(
      BackupValidationError,
    )

    const after = await loadAll()
    expect(JSON.stringify(after.sales)).toBe(JSON.stringify(before.sales))
  })

  it('tolerates missing optional settings instead of blocking a restore', async () => {
    const backup = await goodBackup()
    const older = {
      ...backup,
      data: {
        ...backup.data,
        settings: { currency: 'GBP', defaultCommissionRate: 250 },
        profile: undefined,
      },
    }

    const validated = validateBackup(older)
    expect(validated.data.settings.currency).toBe('GBP')
    expect(validated.data.settings.defaultCommissionRate).toBe(250)
    expect(validated.data.settings.theme).toBe('system') // filled from defaults
    expect(validated.data.settings.workdays).toEqual([1, 2, 3, 4, 5])
    expect(validated.data.profile.displayName).toBe('')
    expect(validated.data.sales).toHaveLength(3) // the sales still come back
  })

  it('rejects an empty or oversized file before parsing it', async () => {
    const empty = new File([], 'empty.json')
    await expect(readBackupFile(empty)).rejects.toMatchObject({ name: 'BackupValidationError' })

    const notJson = new File(['<html>nope</html>'], 'page.html')
    await expect(readBackupFile(notJson)).rejects.toMatchObject({ name: 'BackupValidationError' })
  })
})

// ---------------------------------------------------------------------------
// Restore atomicity
// ---------------------------------------------------------------------------

describe('restore rollback', () => {
  it('returns the device to its previous state when a write fails part way', async () => {
    await seedDevice()
    const before = await loadAll()
    const backup = await createBackup()

    // A backup that is structurally valid but whose third sale cannot be
    // written — the device has already been cleared by the time it fails.
    const boomId = '00000000-0000-4000-8000-00000000dead'
    const poisoned: BackupFile = {
      ...backup,
      data: {
        ...backup.data,
        sales: [
          { ...backup.data.sales[0], id: 'restore-a' },
          { ...backup.data.sales[1], id: 'restore-b' },
          { ...backup.data.sales[2], id: boomId },
        ],
      },
    }

    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function patched(
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (typeof value === 'object' && value !== null && (value as { id?: string }).id === boomId) {
        throw new Error('simulated storage failure part way through a restore')
      }
      return originalPut.call(this, value, key)
    } as typeof IDBObjectStore.prototype.put

    try {
      await expect(restoreBackup(poisoned)).rejects.toMatchObject({ code: 'transaction-failed' })
    } finally {
      IDBObjectStore.prototype.put = originalPut
    }

    // Nothing from the poisoned backup landed, and the original data is back.
    const after = await loadAll()
    expect(after.sales.map((s) => s.id)).not.toContain('restore-a')
    expect(after.sales.map((s) => s.id)).not.toContain(boomId)
    expect(JSON.stringify(after.sales)).toBe(JSON.stringify(before.sales))
    expect(JSON.stringify(after.goals)).toBe(JSON.stringify(before.goals))
    expect(JSON.stringify(after.categories)).toBe(JSON.stringify(before.categories))
    expect(after.settings).toEqual(before.settings)
    expect(after.profile).toEqual(before.profile)
  })

  it('a successful restore leaves nothing from the previous dataset behind', async () => {
    await seedDevice()
    const backup = await createBackup()

    // Replace the device contents entirely, then restore the earlier backup.
    await resetAllData()
    const { settings, categories } = await loadAll()
    await createSale({ amount: 999, date: '2026-08-08', time: '08:08' }, settings, categories)

    await restoreBackup(backup)

    const after = await loadAll()
    expect(after.sales.some((s) => s.amount === 999)).toBe(false)
    expect(after.sales).toHaveLength(3)
    expect(after.categories.some((c) => c.name === 'Aeration')).toBe(true)
  })
})

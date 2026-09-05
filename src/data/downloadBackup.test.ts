/**
 * `downloadBackup` must NOT record the backup date.
 *
 * A browser cannot tell us whether the user kept the file — a cancelled save
 * dialog is indistinguishable from a successful one. If this function ever
 * starts stamping `lastBackupAt` again, the app will report "Backed up today"
 * over a backup that never landed and stop reminding. That is the most
 * dangerous failure this product has, so it is pinned here.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { closeDatabase, destroyDatabase } from './db'
import { downloadBackup, markBackupCreated, storageHealth } from './backup'
import { createSale, loadAll } from './repository'

/** Minimal stand-ins for the two browser APIs `downloadTextFile` reaches for. */
function stubDownloadEnvironment() {
  const clicked: { filename: string; contents: string }[] = []
  let lastBlobText = ''

  vi.stubGlobal('Blob', class {
    constructor(parts: string[]) {
      lastBlobText = parts.join('')
    }
  })
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:stub',
    revokeObjectURL: () => {},
  })
  vi.stubGlobal('document', {
    createElement: () => ({
      style: {},
      set download(name: string) {
        clicked.push({ filename: name, contents: lastBlobText })
      },
      click: () => {},
      remove: () => {},
    }),
    body: { appendChild: () => {} },
  })

  return clicked
}

beforeEach(async () => {
  await destroyDatabase()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await closeDatabase()
})

describe('downloadBackup', () => {
  it('hands over a file without claiming a backup was made', async () => {
    const clicked = stubDownloadEnvironment()
    await createSale({ amount: 38_900, date: '2026-09-04', time: '09:14' }, (await loadAll()).settings, [])

    const before = await storageHealth()
    expect(before.lastBackupAt).toBeNull()

    const result = await downloadBackup()

    expect(clicked).toHaveLength(1)
    expect(result.saleCount).toBe(1)

    // The whole point: the file went out, the date did not go in.
    const after = await storageHealth()
    expect(after.lastBackupAt).toBeNull()
    expect(after.daysSinceBackup).toBeNull()
  })

  it('records the date only once the caller confirms the file saved', async () => {
    stubDownloadEnvironment()
    await createSale({ amount: 10_000, date: '2026-09-04', time: '10:00' }, (await loadAll()).settings, [])

    const result = await downloadBackup()
    await markBackupCreated(result.createdAt)

    const health = await storageHealth()
    expect(health.lastBackupAt).toBe(result.createdAt)
  })

  it('writes a file that parses back to the same ledger', async () => {
    const clicked = stubDownloadEnvironment()
    const settings = (await loadAll()).settings
    await createSale({ amount: 38_900, date: '2026-09-04', time: '09:14' }, settings, [])
    await createSale({ amount: 21_400, date: '2026-09-04', time: '11:42' }, settings, [])

    await downloadBackup()

    const written = JSON.parse(clicked[0].contents)
    expect(written.data.sales).toHaveLength(2)
    expect(written.data.sales.map((s: { amount: number }) => s.amount).sort()).toEqual([21_400, 38_900])
  })
})

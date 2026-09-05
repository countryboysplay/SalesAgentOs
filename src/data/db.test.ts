/**
 * Schema, seeding, and spec §77 Persistence Test.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DB_NAME,
  DB_VERSION,
  SCHEMA_VERSION,
  StorageError,
  closeDatabase,
  defaultSettings,
  destroyDatabase,
  getDB,
  isIndexedDbAvailable,
  requestPersistentStorage,
  storageEstimate,
} from './db'
import { createSale, loadAll } from './repository'
import type { NewSaleInput, Sale } from '../core/types'

beforeEach(async () => {
  await destroyDatabase()
})

afterEach(async () => {
  await closeDatabase()
})

describe('schema', () => {
  it('creates every store and index the app queries', async () => {
    const db = await getDB()

    expect(db.name).toBe(DB_NAME)
    expect(db.version).toBe(DB_VERSION)
    expect([...db.objectStoreNames].sort()).toEqual(['categories', 'goals', 'meta', 'sales'])

    const tx = db.transaction(['sales', 'categories', 'goals'], 'readonly')
    expect([...tx.objectStore('sales').indexNames].sort()).toEqual([
      'categoryId',
      'date',
      'status',
      'status-date',
    ])
    expect([...tx.objectStore('categories').indexNames]).toEqual(['sortOrder'])
    expect([...tx.objectStore('goals').indexNames]).toEqual(['type-effectiveFrom'])
    await tx.done
  })

  it('seeds the three neutral starter categories on first open (§34)', async () => {
    const { categories } = await loadAll()

    expect(categories.map((c) => c.name)).toEqual(['Primary Sale', 'Upsell', 'Other'])
    expect(categories.every((c) => c.active)).toBe(true)
    expect(categories.every((c) => c.commissionRate === null)).toBe(true)
    expect(categories.map((c) => c.sortOrder)).toEqual([0, 1, 2])
    // Ids must be unique and stable-looking.
    expect(new Set(categories.map((c) => c.id)).size).toBe(3)
  })

  it('seeds default settings and an empty profile', async () => {
    const { settings, profile, sales, goals } = await loadAll()

    expect(settings).toEqual(defaultSettings())
    expect(settings.schemaVersion).toBe(SCHEMA_VERSION)
    expect(settings.defaultCommissionRate).toBe(500) // 5% in basis points
    expect(profile.displayName).toBe('')
    expect(sales).toEqual([])
    expect(goals).toEqual([])
  })

  it('does not re-seed on a second open', async () => {
    const first = await loadAll()
    await closeDatabase()
    const second = await loadAll()

    expect(second.categories).toEqual(first.categories)
  })
})

describe('unavailable storage', () => {
  it('throws a typed, user-readable error instead of failing silently', async () => {
    await closeDatabase()
    const real = globalThis.indexedDB
    // Simulate a browser that blocks IndexedDB (private browsing, hardened mode).
    Reflect.deleteProperty(globalThis, 'indexedDB')

    try {
      expect(isIndexedDbAvailable()).toBe(false)
      await expect(getDB()).rejects.toBeInstanceOf(StorageError)
      await expect(getDB()).rejects.toMatchObject({ code: 'unavailable' })

      const error = await getDB().catch((err: StorageError) => err)
      expect((error as StorageError).userMessage).toMatch(/private or incognito/i)
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: real,
        configurable: true,
        writable: true,
      })
    }

    // A retry after the condition clears must succeed — the failure is not cached.
    expect(isIndexedDbAvailable()).toBe(true)
    await expect(getDB()).resolves.toBeTruthy()
  })
})

describe('device storage helpers', () => {
  it('reports gracefully when the Storage Manager is missing', async () => {
    const status = await requestPersistentStorage()
    expect(status.supported).toBe(false)
    expect(status.persisted).toBe(false)
    expect(status.reason).toBeTruthy()

    const estimate = await storageEstimate()
    expect(estimate.supported).toBe(false)
    expect(estimate.usedFraction).toBeNull()
  })

  it('uses navigator.storage when it exists', async () => {
    const original = (globalThis as { navigator?: unknown }).navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          persisted: async () => false,
          persist: async () => true,
          estimate: async () => ({ usage: 512, quota: 2048 }),
        },
      },
      configurable: true,
      writable: true,
    })

    try {
      await expect(requestPersistentStorage()).resolves.toEqual({ supported: true, persisted: true })
      const estimate = await storageEstimate()
      expect(estimate).toMatchObject({ supported: true, usageBytes: 512, quotaBytes: 2048, usedFraction: 0.25 })
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'navigator')
      else Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true, writable: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Spec §77 — Persistence Test
// ---------------------------------------------------------------------------

describe('§77 Persistence Test', () => {
  it('keeps 120 sales across many months byte-identical after close and reopen', async () => {
    const { settings, categories } = await loadAll()

    const written: Sale[] = []
    for (let i = 0; i < 120; i += 1) {
      // Spread across 12 months of 2026 so multiple month buckets are exercised.
      const month = String((i % 12) + 1).padStart(2, '0')
      const day = String((i % 27) + 1).padStart(2, '0')
      const hour = String(i % 24).padStart(2, '0')

      const input: NewSaleInput = {
        amount: 10_000 + i * 137, // varied, never round
        date: `2026-${month}-${day}`,
        time: `${hour}:${String((i * 7) % 60).padStart(2, '0')}`,
        categoryId: categories[i % categories.length].id,
        note: i % 5 === 0 ? `Note ${i} — with "quotes", a comma, and\na newline` : null,
      }
      written.push(await createSale(input, settings, categories))
    }

    expect(written).toHaveLength(120)

    // Close the connection the way a tab close or refresh would.
    await closeDatabase()

    const reopened = await loadAll()
    expect(reopened.sales).toHaveLength(120)

    const byId = new Map(reopened.sales.map((s) => [s.id, s]))
    for (const original of written) {
      const stored = byId.get(original.id)
      expect(stored).toBeDefined()
      // Byte-identical: every field, not just the ones we happen to read.
      expect(JSON.stringify(stored)).toBe(JSON.stringify(original))
    }

    // Settings, categories and profile survive too.
    expect(reopened.categories).toHaveLength(3)
    expect(reopened.settings).toEqual(defaultSettings())
  })

  it('survives repeated close/reopen cycles without losing or duplicating records', async () => {
    const { settings, categories } = await loadAll()
    await createSale(
      { amount: 50_000, date: '2026-03-04', time: '09:15', categoryId: categories[0].id },
      settings,
      categories,
    )

    for (let cycle = 0; cycle < 5; cycle += 1) {
      await closeDatabase()
      const { sales } = await loadAll()
      expect(sales).toHaveLength(1)
      expect(sales[0].amount).toBe(50_000)
    }
  })
})

/**
 * Repository behaviour: commission freezing (§69), cancellation (§16/§18),
 * undo (§70), category lifecycle (§34) and versioned goals (§32, §77).
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeDatabase, destroyDatabase } from './db'
import {
  cancelSale,
  computeCommission,
  countSales,
  createCategory,
  createSale,
  deactivateCategory,
  deleteCategory,
  deleteSale,
  disableGoal,
  getSale,
  listGoals,
  loadAll,
  recentCategories,
  restoreSale,
  salesByStatusInRange,
  salesDateRange,
  salesInRange,
  saveProfile,
  saveSettings,
  setGoal,
  uncancelSale,
  updateCategory,
  updateSale,
} from './repository'
import type { Category, Goal, GoalType, IsoDate, Settings } from '../core/types'

beforeEach(async () => {
  await destroyDatabase()
})

afterEach(async () => {
  await closeDatabase()
})

async function context(): Promise<{ settings: Settings; categories: Category[] }> {
  const { settings, categories } = await loadAll()
  return { settings, categories }
}

/**
 * The resolution `src/core/calc` performs when it asks "which goal applied on
 * this date?". Reimplemented here rather than imported so this suite does not
 * depend on a module another agent owns — the point of the test is that the
 * ROWS we store make the right answer available.
 */
function goalFor(goals: Goal[], type: GoalType, date: IsoDate): Goal | null {
  const match = goals.find(
    (g) => g.type === type && g.effectiveFrom <= date && (g.effectiveTo === null || g.effectiveTo >= date),
  )
  return match && match.enabled ? match : null
}

// ---------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------

describe('commission', () => {
  it('computes exact integer cents from basis points (§77 Commission Test)', () => {
    expect(computeCommission(50_000, 500)).toBe(2_500) // $500 @ 5% = $25
    expect(computeCommission(50_000, 300)).toBe(1_500) // $500 @ 3% = $15
    expect(computeCommission(2_500, 500)).toBe(125)
    expect(computeCommission(3_333, 500)).toBe(167) // rounds, never floats
    expect(computeCommission(0, 500)).toBe(0)
  })

  it('resolves explicit override, then category rule, then global default (§33)', async () => {
    const { settings, categories } = await context()
    const upsell = await createCategory({ name: 'Upsell 3%', commissionRate: 300 })
    const all = [...categories, upsell]

    const fromDefault = await createSale(
      { amount: 50_000, date: '2026-01-05', time: '10:00', categoryId: categories[0].id },
      settings,
      all,
    )
    const fromCategory = await createSale(
      { amount: 50_000, date: '2026-01-05', time: '10:01', categoryId: upsell.id },
      settings,
      all,
    )
    const fromOverride = await createSale(
      { amount: 50_000, date: '2026-01-05', time: '10:02', categoryId: upsell.id, commissionRate: 1_000 },
      settings,
      all,
    )

    expect([fromDefault.commissionRate, fromDefault.commissionAmount]).toEqual([500, 2_500])
    expect([fromCategory.commissionRate, fromCategory.commissionAmount]).toEqual([300, 1_500])
    expect([fromOverride.commissionRate, fromOverride.commissionAmount]).toEqual([1_000, 5_000])
  })

  it('FREEZES the rate: changing the default later never moves an old sale (§69)', async () => {
    const { settings, categories } = await context()

    const march = await createSale(
      { amount: 50_000, date: '2026-03-14', time: '11:30', categoryId: categories[0].id },
      settings,
      categories,
    )
    expect(march.commissionRate).toBe(500)
    expect(march.commissionAmount).toBe(2_500)

    // The user raises their default rate in September.
    const raised = await saveSettings({ ...settings, defaultCommissionRate: 600 })

    const stored = await getSale(march.id)
    expect(stored?.commissionRate).toBe(500)
    expect(stored?.commissionAmount).toBe(2_500)

    // New sales pick up the new rate.
    const september = await createSale(
      { amount: 50_000, date: '2026-09-14', time: '11:30', categoryId: categories[0].id },
      raised,
      categories,
    )
    expect(september.commissionRate).toBe(600)
    expect(september.commissionAmount).toBe(3_000)

    // And it still holds after a reload.
    await closeDatabase()
    const { sales } = await loadAll()
    expect(sales.find((s) => s.id === march.id)?.commissionRate).toBe(500)
  })

  it('changing a category rule does not touch sales already written to it', async () => {
    const { settings, categories } = await context()
    const category = await createCategory({ name: 'Program', commissionRate: 500 })

    const sale = await createSale(
      { amount: 100_000, date: '2026-02-02', time: '08:00', categoryId: category.id },
      settings,
      [...categories, category],
    )
    expect(sale.commissionAmount).toBe(5_000)

    await updateCategory(category.id, { commissionRate: 200 })

    expect((await getSale(sale.id))?.commissionAmount).toBe(5_000)
  })

  it('recomputes an edited sale from its own frozen rate, not the current default', async () => {
    const { settings, categories } = await context()
    const sale = await createSale(
      { amount: 50_000, date: '2026-03-14', time: '11:30', categoryId: categories[0].id },
      settings,
      categories,
    )

    await saveSettings({ ...settings, defaultCommissionRate: 900 })
    const edited = await updateSale(sale.id, { amount: 100_000 })

    expect(edited.commissionRate).toBe(500)
    expect(edited.commissionAmount).toBe(5_000)
    expect(edited.modifiedAt).toBeGreaterThanOrEqual(sale.createdAt)
  })
})

// ---------------------------------------------------------------------------
// Sales lifecycle
// ---------------------------------------------------------------------------

describe('sales', () => {
  it('rejects malformed input rather than storing it', async () => {
    const { settings, categories } = await context()

    await expect(
      createSale({ amount: 500.5, date: '2026-01-01', time: '09:00' }, settings, categories),
    ).rejects.toMatchObject({ code: 'invalid-input' })

    await expect(
      createSale({ amount: 500, date: '2026-02-30', time: '09:00' }, settings, categories),
    ).rejects.toMatchObject({ code: 'invalid-input' })

    await expect(
      createSale({ amount: 500, date: '2026-01-01', time: '25:00' }, settings, categories),
    ).rejects.toMatchObject({ code: 'invalid-input' })

    await expect(
      createSale({ amount: 500, date: '2026-01-01', time: '09:00', categoryId: 'nope' }, settings, categories),
    ).rejects.toMatchObject({ code: 'not-found' })

    expect(await countSales()).toBe(0)
  })

  it('§77 Cancellation Test: cancelling preserves the original record', async () => {
    const { settings, categories } = await context()
    const sale = await createSale(
      { amount: 50_000, date: '2026-04-01', time: '14:00', categoryId: categories[0].id, note: 'Renewal' },
      settings,
      categories,
    )

    const cancelled = await cancelSale(sale.id, 'Customer backed out', '2026-04-09')

    // The original $500 is untouched — the ledger still shows it (§18).
    expect(cancelled.amount).toBe(50_000)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.note).toBe('Renewal')
    expect(cancelled.date).toBe('2026-04-01')
    expect(cancelled.commissionAmount).toBe(2_500)
    expect(cancelled.cancellation).toMatchObject({
      cancelledOn: '2026-04-09',
      reason: 'Customer backed out',
    })
    expect(cancelled.cancellation?.cancelledAt).toBeGreaterThan(0)

    // It is still there after a reload, still one record.
    await closeDatabase()
    const { sales } = await loadAll()
    expect(sales).toHaveLength(1)
    expect(sales[0].amount).toBe(50_000)
    expect(sales[0].status).toBe('cancelled')
  })

  it('undo of a cancellation restores the previous status (§70)', async () => {
    const { settings, categories } = await context()
    const sale = await createSale(
      { amount: 20_000, date: '2026-04-01', time: '14:00' },
      settings,
      categories,
    )

    await cancelSale(sale.id, null)
    const restored = await uncancelSale(sale.id)

    expect(restored.status).toBe('active')
    expect(restored.cancellation).toBeNull()
    expect(restored.amount).toBe(20_000)
  })

  it('returns an adjusted sale to adjusted, not active, after undo', async () => {
    const { settings, categories } = await context()
    const sale = await createSale({ amount: 20_000, date: '2026-04-01', time: '14:00' }, settings, categories)

    await updateSale(sale.id, { adjustedAmount: 15_000, status: 'adjusted' })
    await cancelSale(sale.id, null)
    const restored = await uncancelSale(sale.id)

    expect(restored.status).toBe('adjusted')
    expect(restored.adjustedAmount).toBe(15_000)
  })

  it('undo of a delete puts the exact record back (§70)', async () => {
    const { settings, categories } = await context()
    const sale = await createSale(
      { amount: 33_300, date: '2026-05-05', time: '16:45', note: 'Referral' },
      settings,
      categories,
    )

    const removed = await deleteSale(sale.id)
    expect(await getSale(sale.id)).toBeUndefined()
    expect(await countSales()).toBe(0)

    await restoreSale(removed)
    const back = await getSale(sale.id)
    expect(JSON.stringify(back)).toBe(JSON.stringify(sale))
  })

  it('reports a missing record instead of pretending to succeed', async () => {
    await expect(deleteSale('missing')).rejects.toMatchObject({ code: 'not-found' })
    await expect(updateSale('missing', { amount: 1 })).rejects.toMatchObject({ code: 'not-found' })
    await expect(cancelSale('missing')).rejects.toMatchObject({ code: 'not-found' })
  })
})

// ---------------------------------------------------------------------------
// Index-backed queries
// ---------------------------------------------------------------------------

describe('queries', () => {
  it('salesInRange is inclusive on both ends and uses the date index', async () => {
    const { settings, categories } = await context()
    for (const date of ['2025-12-31', '2026-01-01', '2026-01-15', '2026-01-31', '2026-02-01']) {
      await createSale({ amount: 10_000, date, time: '12:00' }, settings, categories)
    }

    const january = await salesInRange('2026-01-01', '2026-01-31')
    expect(january.map((s) => s.date)).toEqual(['2026-01-01', '2026-01-15', '2026-01-31'])

    expect(await salesDateRange()).toEqual({ from: '2025-12-31', to: '2026-02-01' })
  })

  it('salesByStatusInRange uses the compound index', async () => {
    const { settings, categories } = await context()
    const a = await createSale({ amount: 10_000, date: '2026-01-10', time: '09:00' }, settings, categories)
    await createSale({ amount: 20_000, date: '2026-01-20', time: '09:00' }, settings, categories)
    await cancelSale(a.id, null, '2026-01-11')

    const active = await salesByStatusInRange('active', '2026-01-01', '2026-01-31')
    const cancelled = await salesByStatusInRange('cancelled', '2026-01-01', '2026-01-31')

    expect(active.map((s) => s.amount)).toEqual([20_000])
    expect(cancelled.map((s) => s.amount)).toEqual([10_000])
  })

  it('recentCategories returns distinct ids, newest first (§14)', async () => {
    const { settings, categories } = await context()
    const [primary, upsell, other] = categories

    await createSale({ amount: 1_000, date: '2026-01-01', time: '09:00', categoryId: other.id }, settings, categories)
    await createSale({ amount: 1_000, date: '2026-01-02', time: '09:00', categoryId: upsell.id }, settings, categories)
    await createSale({ amount: 1_000, date: '2026-01-03', time: '09:00', categoryId: null }, settings, categories)
    await createSale({ amount: 1_000, date: '2026-01-04', time: '09:00', categoryId: primary.id }, settings, categories)
    await createSale({ amount: 1_000, date: '2026-01-05', time: '09:00', categoryId: upsell.id }, settings, categories)

    expect(await recentCategories(3)).toEqual([upsell.id, primary.id, other.id])
    expect(await recentCategories(1)).toEqual([upsell.id])
    expect(await recentCategories(0)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Categories (§34)
// ---------------------------------------------------------------------------

describe('categories', () => {
  it('deactivating keeps the category attached to old sales', async () => {
    const { settings, categories } = await context()
    const sale = await createSale(
      { amount: 10_000, date: '2026-06-01', time: '10:00', categoryId: categories[1].id },
      settings,
      categories,
    )

    const deactivated = await deactivateCategory(categories[1].id)
    expect(deactivated.active).toBe(false)

    const { categories: after } = await loadAll()
    expect(after).toHaveLength(3)
    expect((await getSale(sale.id))?.categoryId).toBe(categories[1].id)
  })

  it('downgrades a delete to a deactivate when sales reference it', async () => {
    const { settings, categories } = await context()
    await createSale(
      { amount: 10_000, date: '2026-06-01', time: '10:00', categoryId: categories[0].id },
      settings,
      categories,
    )

    const result = await deleteCategory(categories[0].id)

    expect(result.outcome).toBe('deactivated')
    expect(result.referencingSales).toBe(1)
    expect(result.category.active).toBe(false)
    expect((await loadAll()).categories).toHaveLength(3)
  })

  it('hard-deletes only a category nothing references', async () => {
    const { categories } = await context()

    const result = await deleteCategory(categories[2].id)

    expect(result.outcome).toBe('deleted')
    expect(result.referencingSales).toBe(0)
    expect((await loadAll()).categories.map((c) => c.name)).toEqual(['Primary Sale', 'Upsell'])
  })

  it('rejects a blank category name', async () => {
    await expect(createCategory({ name: '   ' })).rejects.toMatchObject({ code: 'invalid-input' })
  })
})

// ---------------------------------------------------------------------------
// Goals (§32, §69, §77 Goal Change Test)
// ---------------------------------------------------------------------------

describe('goals', () => {
  it('§77 Goal Change Test: January keeps its $8,000 goal forever', async () => {
    const january = await setGoal('monthly', 800_000, '2026-01-01')
    expect(january.effectiveTo).toBeNull()

    const february = await setGoal('monthly', 1_000_000, '2026-02-01')

    const goals = await listGoals('monthly')
    expect(goals).toHaveLength(2)

    const stored = goals.find((g) => g.id === january.id)
    // The January row still exists, untouched apart from being closed out.
    expect(stored).toBeDefined()
    expect(stored?.amount).toBe(800_000)
    expect(stored?.effectiveFrom).toBe('2026-01-01')
    expect(stored?.effectiveTo).toBe('2026-01-31')
    expect(stored?.enabled).toBe(true)
    expect(stored?.createdAt).toBe(january.createdAt)

    expect(february.effectiveFrom).toBe('2026-02-01')
    expect(february.effectiveTo).toBeNull()
    expect(february.amount).toBe(1_000_000)

    // And that is exactly what a January date resolves to.
    expect(goalFor(goals, 'monthly', '2026-01-15')?.amount).toBe(800_000)
    expect(goalFor(goals, 'monthly', '2026-01-01')?.amount).toBe(800_000)
    expect(goalFor(goals, 'monthly', '2026-01-31')?.amount).toBe(800_000)
    expect(goalFor(goals, 'monthly', '2026-02-01')?.amount).toBe(1_000_000)
    expect(goalFor(goals, 'monthly', '2026-12-31')?.amount).toBe(1_000_000)
    expect(goalFor(goals, 'monthly', '2025-12-31')).toBeNull()
  })

  it('closes the previous row across a month boundary in a leap year', async () => {
    await setGoal('daily', 40_000, '2024-01-15')
    await setGoal('daily', 50_000, '2024-03-01')

    const goals = await listGoals('daily')
    expect(goals[0].effectiveTo).toBe('2024-02-29')
  })

  it('keeps every goal type independent', async () => {
    await setGoal('daily', 40_000, '2026-01-01')
    await setGoal('monthly', 800_000, '2026-01-01')
    await setGoal('annual', 9_600_000, '2026-01-01')
    await setGoal('monthly', 1_000_000, '2026-02-01')

    expect(await listGoals('daily')).toHaveLength(1)
    expect(await listGoals('monthly')).toHaveLength(2)
    expect(await listGoals('annual')).toHaveLength(1)
    expect(await listGoals()).toHaveLength(4)
  })

  it('supersedes a row that starts later rather than being bounded by it', async () => {
    // This used to assert the opposite — that the later row survived and
    // bounded the back-dated one. That behaviour is what made "apply from the
    // start of this month" write a three-day goal and leave the OLD amount in
    // force from its start date onward forever, while the UI promised the new
    // one applied "from September 1 onward".
    //
    // `setGoal(type, amount, from)` means "from this date onward, the goal is
    // X", which is exactly what the UI says, so nothing later may survive.
    // There is no way to schedule a future goal change in the product.
    await setGoal('monthly', 1_000_000, '2026-06-01')
    const earlier = await setGoal('monthly', 700_000, '2026-01-01')

    const goals = await listGoals('monthly')
    expect(goals.map((g) => g.id)).toEqual([earlier.id])
    expect(goals[0].effectiveTo).toBeNull()

    expect(goalFor(goals, 'monthly', '2026-05-31')?.amount).toBe(700_000)
    expect(goalFor(goals, 'monthly', '2026-06-01')?.amount).toBe(700_000)
  })

  it('corrects a same-day goal in place instead of creating an ambiguous second row', async () => {
    const first = await setGoal('monthly', 800_000, '2026-01-01')
    const corrected = await setGoal('monthly', 850_000, '2026-01-01')

    const goals = await listGoals('monthly')
    expect(goals).toHaveLength(1)
    expect(corrected.id).toBe(first.id)
    expect(goals[0].amount).toBe(850_000)
  })

  it('disabling a goal records "no goal from here" without erasing history', async () => {
    await setGoal('monthly', 800_000, '2026-01-01')
    await disableGoal('monthly', '2026-05-01')

    const goals = await listGoals('monthly')
    expect(goals).toHaveLength(2)
    expect(goals[0].amount).toBe(800_000)
    expect(goals[0].effectiveTo).toBe('2026-04-30')
    expect(goals[1].enabled).toBe(false)

    expect(goalFor(goals, 'monthly', '2026-03-01')?.amount).toBe(800_000)
    expect(goalFor(goals, 'monthly', '2026-06-01')).toBeNull()
  })

  it('rejects an impossible effective date', async () => {
    await expect(setGoal('monthly', 800_000, '2026-13-01')).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(setGoal('monthly', 1.5, '2026-01-01')).rejects.toMatchObject({ code: 'invalid-input' })
  })
})

// ---------------------------------------------------------------------------
// Settings & profile
// ---------------------------------------------------------------------------

describe('settings and profile', () => {
  it('round-trips through the meta store', async () => {
    const { settings } = await context()

    await saveSettings({ ...settings, currency: 'CAD', workdays: [1, 2, 3, 4, 5, 6], theme: 'dark' })
    await saveProfile({ displayName: 'Jordan', initials: 'JL', createdAt: 1_700_000_000_000 })

    await closeDatabase()
    const reloaded = await loadAll()

    expect(reloaded.settings.currency).toBe('CAD')
    expect(reloaded.settings.workdays).toEqual([1, 2, 3, 4, 5, 6])
    expect(reloaded.settings.theme).toBe('dark')
    expect(reloaded.profile).toEqual({ displayName: 'Jordan', initials: 'JL', createdAt: 1_700_000_000_000 })
  })
})

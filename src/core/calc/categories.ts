/**
 * Category performance (spec §31).
 *
 * Sales without a category are not dropped — they roll up under a synthetic
 * entry with `categoryId: null` so the shares always add up to 100%.
 */
import { averageCents, percentOf } from '../money'
import { effectiveCommission, isActive, effectiveAmount, selectSales } from './totals'
import type { SaleSelector } from './totals'
import type { Category, CategoryPerformance, Cents, Sale } from '../types'

export type CategorySort = 'revenue' | 'count' | 'average'
export type SortDirection = 'asc' | 'desc'

export interface CategoryOptions {
  sort?: CategorySort
  direction?: SortDirection
  /** Include active categories with no sales in the range, as zero rows. */
  includeEmpty?: boolean
  /** Label for the synthetic uncategorised bucket. */
  uncategorisedLabel?: string
  /** Label for a sale pointing at a category that no longer exists. */
  unknownLabel?: string
}

const DEFAULT_UNCATEGORISED = 'Uncategorised'
const DEFAULT_UNKNOWN = 'Removed category'

interface Bucket {
  categoryId: string | null
  name: string
  netSales: Cents
  saleCount: number
  estimatedCommission: Cents
  sortOrder: number
}

export function categoryPerformance(
  sales: readonly Sale[],
  categories: readonly Category[],
  range?: SaleSelector,
  options: CategoryOptions = {},
): CategoryPerformance[] {
  const {
    sort = 'revenue',
    direction = 'desc',
    includeEmpty = false,
    uncategorisedLabel = DEFAULT_UNCATEGORISED,
    unknownLabel = DEFAULT_UNKNOWN,
  } = options

  const byId = new Map(categories.map((category) => [category.id, category]))
  const buckets = new Map<string, Bucket>()

  const bucketFor = (categoryId: string | null): Bucket => {
    // null and 'null' can never collide because ids are prefixed on lookup.
    const key = categoryId === null ? '\u0000uncategorised' : `id:${categoryId}`
    let bucket = buckets.get(key)
    if (!bucket) {
      const category = categoryId === null ? undefined : byId.get(categoryId)
      bucket = {
        categoryId,
        name:
          categoryId === null ? uncategorisedLabel : (category?.name ?? unknownLabel),
        netSales: 0,
        saleCount: 0,
        estimatedCommission: 0,
        // Uncategorised sorts last among equals; unknown categories after real ones.
        sortOrder: categoryId === null ? Number.MAX_SAFE_INTEGER : (category?.sortOrder ?? 1e9),
      }
      buckets.set(key, bucket)
    }
    return bucket
  }

  if (includeEmpty) {
    for (const category of categories) {
      if (category.active) bucketFor(category.id)
    }
  }

  for (const sale of selectSales(sales, range)) {
    const bucket = bucketFor(sale.categoryId)
    bucket.netSales += effectiveAmount(sale)
    if (isActive(sale)) {
      bucket.saleCount += 1
      bucket.estimatedCommission += effectiveCommission(sale)
    }
  }

  const totalNet = [...buckets.values()].reduce((sum, bucket) => sum + bucket.netSales, 0)

  const rows: CategoryPerformance[] = [...buckets.values()].map((bucket) => ({
    categoryId: bucket.categoryId,
    name: bucket.name,
    netSales: bucket.netSales,
    saleCount: bucket.saleCount,
    averageSale: averageCents(bucket.netSales, bucket.saleCount),
    estimatedCommission: bucket.estimatedCommission,
    share: percentOf(bucket.netSales, totalNet),
  }))

  return sortCategories(rows, sort, direction, [...buckets.values()])
}

function sortCategories(
  rows: CategoryPerformance[],
  sort: CategorySort,
  direction: SortDirection,
  buckets: Bucket[],
): CategoryPerformance[] {
  const order = new Map(buckets.map((bucket) => [bucket.categoryId, bucket.sortOrder]))
  const sign = direction === 'asc' ? -1 : 1
  return rows.sort((a, b) => {
    const diff = metric(a, sort) - metric(b, sort)
    if (diff !== 0) return sign * -diff
    // Stable, readable tie-break: the user's own category order, then name.
    const orderDiff = (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })
}

function metric(row: CategoryPerformance, sort: CategorySort): number {
  switch (sort) {
    case 'count':
      return row.saleCount
    case 'average':
      return row.averageSale
    case 'revenue':
    default:
      return row.netSales
  }
}

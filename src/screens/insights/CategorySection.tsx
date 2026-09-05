/**
 * Category performance (§31).
 *
 * A ranked bar list rather than a pie: the eye compares lengths against a
 * shared baseline accurately and compares angles badly, and with categories
 * plus an uncategorised bucket a pie would be a ring of slices nobody can
 * order. Sorted bars *are* the ranking.
 *
 * Bars are scaled against the leader of the active sort, so the longest bar is
 * always the top row and the visual order can never contradict the sort. The
 * share-of-net figure is printed as text beside it, because a percentage is
 * read, not estimated from a bar.
 *
 * Uncategorised sales are included, never hidden — the calc layer rolls them
 * into their own row so the shares still add to 100%.
 */
import { useMemo, useState } from 'react'
import { Card, EmptyState, SegmentedControl } from '@/components'
import { categoryPerformance } from '@/core/calc'
import type { CategorySort } from '@/core/calc'
import { formatCurrency, formatNumber, formatPercent } from '@/core/format'
import type { Category, CategoryPerformance, Sale, Settings } from '@/core/types'
import type { ResolvedRange } from './range'

export interface CategorySectionProps {
  sales: readonly Sale[]
  categories: readonly Category[]
  settings: Settings
  range: ResolvedRange
}

const SORT_OPTIONS = [
  { value: 'revenue' as const, label: 'Revenue', ariaLabel: 'Sort by revenue' },
  { value: 'count' as const, label: 'Sales', ariaLabel: 'Sort by number of sales' },
  { value: 'average' as const, label: 'Avg Sale', ariaLabel: 'Sort by average sale' },
]

/** Field selection, not arithmetic — every figure was produced by calc. */
function metricOf(row: CategoryPerformance, sort: CategorySort): number {
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

function metricText(row: CategoryPerformance, sort: CategorySort, settings: Settings): string {
  switch (sort) {
    case 'count':
      return formatNumber(row.saleCount, settings)
    case 'average':
      return formatCurrency(row.averageSale, settings)
    case 'revenue':
    default:
      return formatCurrency(row.netSales, settings)
  }
}

export function CategorySection({ sales, categories, settings, range }: CategorySectionProps) {
  const [sort, setSort] = useState<CategorySort>('revenue')
  const { from, to } = range

  const rows = useMemo(
    () => categoryPerformance(sales, categories, { from, to }, { sort, direction: 'desc' }),
    [sales, categories, from, to, sort],
  )

  const leader = rows.length > 0 ? metricOf(rows[0], sort) : 0

  // The list itself is readable, so the summary explains the *chart* — what the
  // bars encode and who leads — instead of reciting rows twice (§63).
  const summary = useMemo(() => {
    if (rows.length === 0) return ''
    const sortName =
      sort === 'revenue' ? 'revenue' : sort === 'count' ? 'number of sales' : 'average sale'
    const top = rows[0]
    return `Bar ranking of ${rows.length} ${
      rows.length === 1 ? 'category' : 'categories'
    } by ${sortName}, ${range.label.toLowerCase()}. Each bar is drawn against the leader, ${
      top.name
    } at ${metricText(top, sort, settings)}, which is ${formatPercent(
      top.share,
      settings,
      0,
    )} of net sales. Every figure is in the list that follows.`
  }, [rows, sort, settings, range.label])

  return (
    <Card title="Categories" headerAction={<span className="insights__scope">{range.label}</span>}>
      <SegmentedControl
        className="insights__toggle"
        label="Sort categories by"
        options={SORT_OPTIONS}
        value={sort}
        onChange={setSort}
      />

      {rows.length === 0 ? (
        <EmptyState
          compact
          title="Category totals appear once sales land in this range."
          body="Every sale counts here — the ones you leave uncategorised get their own row."
        />
      ) : (
        <>
          <p className="sr-only">{summary}</p>
          <ol className="cats">
            {rows.map((row, index) => {
              const value = metricOf(row, sort)
              const width = leader > 0 ? Math.max(2, (value / leader) * 100) : 2
              return (
                <li className="cats__row" key={row.categoryId ?? 'uncategorised'}>
                  <div className="cats__head">
                    <span className="cats__rank">{index + 1}</span>
                    <span className="cats__name">{row.name}</span>
                    <span className="cats__figure num">{metricText(row, sort, settings)}</span>
                  </div>
                  <div className="cats__track" aria-hidden="true">
                    <span className="cats__fill" style={{ width: `${width}%` }} />
                  </div>
                  <p className="cats__meta">
                    {sort !== 'revenue' && <>{formatCurrency(row.netSales, settings)} · </>}
                    {formatNumber(row.saleCount, settings)} {row.saleCount === 1 ? 'sale' : 'sales'} ·{' '}
                    {formatCurrency(row.averageSale, settings)} avg ·{' '}
                    {formatPercent(row.share, settings, 0)} of net
                  </p>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </Card>
  )
}

export default CategorySection

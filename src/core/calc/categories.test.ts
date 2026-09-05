import { categoryPerformance } from './categories'
import { adjust, cancel, makeCategory, makeSale } from './fixtures'

const lawn = makeCategory({ id: 'cat-lawn', name: 'Lawn Program', sortOrder: 0 })
const aeration = makeCategory({ id: 'cat-aeration', name: 'Aeration', sortOrder: 1 })
const grub = makeCategory({ id: 'cat-grub', name: 'Grub Control', sortOrder: 2 })
const retired = makeCategory({ id: 'cat-old', name: 'Retired', sortOrder: 3, active: false })
const categories = [lawn, aeration, grub, retired]

const sales = [
  makeSale({ amount: 300_000, date: '2026-09-01', categoryId: 'cat-lawn' }),
  makeSale({ amount: 124_100, date: '2026-09-02', categoryId: 'cat-lawn' }),
  makeSale({ amount: 188_200, date: '2026-09-03', categoryId: 'cat-aeration' }),
  makeSale({ amount: 131_100, date: '2026-09-04', categoryId: 'cat-grub' }),
  makeSale({ amount: 90_800, date: '2026-09-04', categoryId: null }),
]

describe('categoryPerformance (spec §31)', () => {
  it('ranks by revenue by default', () => {
    const rows = categoryPerformance(sales, categories)
    expect(rows.map((row) => row.name)).toEqual([
      'Lawn Program',
      'Aeration',
      'Grub Control',
      'Uncategorised',
    ])
    expect(rows[0].netSales).toBe(424_100)
    expect(rows[0].saleCount).toBe(2)
    expect(rows[0].averageSale).toBe(212_050)
    expect(rows[0].estimatedCommission).toBe(21_205)
  })

  it('rolls uncategorised sales up under a null category id', () => {
    const rows = categoryPerformance(sales, categories)
    const uncategorised = rows.find((row) => row.categoryId === null)
    expect(uncategorised).toBeDefined()
    expect(uncategorised?.netSales).toBe(90_800)
    expect(uncategorised?.name).toBe('Uncategorised')
  })

  it('produces shares that add up to the whole', () => {
    const rows = categoryPerformance(sales, categories)
    const total = rows.reduce((sum, row) => sum + row.share, 0)
    expect(total).toBeCloseTo(1, 10)
    expect(rows[0].share).toBeCloseTo(424_100 / 834_200, 10)
  })

  it('sorts by count and by average sale', () => {
    const byCount = categoryPerformance(sales, categories, undefined, { sort: 'count' })
    expect(byCount[0].name).toBe('Lawn Program') // 2 sales
    const byAverage = categoryPerformance(sales, categories, undefined, { sort: 'average' })
    expect(byAverage[0].name).toBe('Lawn Program') // $2,120.50 average
    expect(byAverage[1].name).toBe('Aeration') // $1,882.00
    expect(byAverage.map((row) => row.averageSale)).toEqual(
      [...byAverage.map((row) => row.averageSale)].sort((a, b) => b - a),
    )
  })

  it('can sort ascending', () => {
    const rows = categoryPerformance(sales, categories, undefined, { direction: 'asc' })
    expect(rows[0].name).toBe('Uncategorised')
    expect(rows[rows.length - 1].name).toBe('Lawn Program')
  })

  it('honours a date range', () => {
    const rows = categoryPerformance(sales, categories, { from: '2026-09-01', to: '2026-09-02' })
    expect(rows).toHaveLength(1)
    expect(rows[0].netSales).toBe(424_100)
  })

  it('keeps cancelled sales out of the count and the net', () => {
    const withCancellation = [...sales, cancel(makeSale({ amount: 500_000, date: '2026-09-05', categoryId: 'cat-grub' }))]
    const rows = categoryPerformance(withCancellation, categories)
    const grubRow = rows.find((row) => row.categoryId === 'cat-grub')
    expect(grubRow?.netSales).toBe(131_100)
    expect(grubRow?.saleCount).toBe(1)
  })

  it('counts an adjusted sale at its revised amount', () => {
    const adjusted = [adjust(makeSale({ amount: 500_000, date: '2026-09-05', categoryId: 'cat-grub' }), 100_000)]
    const rows = categoryPerformance(adjusted, categories)
    expect(rows[0].netSales).toBe(100_000)
    expect(rows[0].estimatedCommission).toBe(5000)
  })

  it('omits categories with no sales unless asked', () => {
    const rows = categoryPerformance(sales, categories)
    expect(rows.some((row) => row.name === 'Retired')).toBe(false)
    const withEmpty = categoryPerformance(sales, categories, undefined, { includeEmpty: true })
    expect(withEmpty).toHaveLength(4) // three active with sales + uncategorised
    expect(withEmpty.every((row) => row.name !== 'Retired')).toBe(true)
  })

  it('still reports sales pointing at a category that no longer exists', () => {
    const orphan = [makeSale({ amount: 10_000, date: '2026-09-06', categoryId: 'cat-gone' })]
    const rows = categoryPerformance(orphan, categories)
    expect(rows[0].categoryId).toBe('cat-gone')
    expect(rows[0].name).toBe('Removed category')
  })

  it('keeps inactive categories attached to old sales (spec §34)', () => {
    const old = [makeSale({ amount: 10_000, date: '2026-01-06', categoryId: 'cat-old' })]
    const rows = categoryPerformance(old, categories)
    expect(rows[0].name).toBe('Retired')
  })

  it('returns nothing for an empty ledger', () => {
    expect(categoryPerformance([], categories)).toEqual([])
  })

  it('is share-safe when everything nets to zero', () => {
    const allCancelled = [cancel(makeSale({ amount: 10_000, date: '2026-09-06', categoryId: 'cat-lawn' }))]
    const rows = categoryPerformance(allCancelled, categories)
    expect(rows[0].share).toBe(0)
    expect(rows[0].averageSale).toBe(0)
  })
})

/**
 * CSV export — RFC 4180 escaping, formula-injection defence, plain decimals.
 * Spec §41.
 */

import { describe, expect, it } from 'vitest'

import {
  CSV_COLUMNS,
  csvFilename,
  escapeCsvCell,
  exportSalesCsv,
  formatBasisPointsPlain,
  formatCentsPlain,
  parseCsv,
} from './csv'
import { defaultSettings } from './db'
import { effectiveCommission, totalsFor } from '../core/calc'
import type { Category, Sale, Settings } from '../core/types'

const settings: Settings = defaultSettings()

const categories: Category[] = [
  { id: 'cat-1', name: 'Primary Sale', icon: null, commissionRate: null, active: true, sortOrder: 0, createdAt: 1 },
  { id: 'cat-2', name: 'Upsell, Renewal', icon: null, commissionRate: 300, active: true, sortOrder: 1, createdAt: 1 },
]

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'sale-1',
    amount: 38_900,
    date: '2026-09-04',
    time: '14:32',
    categoryId: 'cat-1',
    commissionRate: 500,
    commissionAmount: 1_945,
    note: null,
    status: 'active',
    createdAt: 1_760_000_000_000,
    modifiedAt: 1_760_000_000_000,
    cancellation: null,
    adjustedAmount: null,
    ...overrides,
  }
}

describe('filename', () => {
  it('matches the spec pattern', () => {
    expect(csvFilename('2026-09-04')).toBe('SalesTrack-Sales-2026-09-04.csv')
  })
})

describe('number formatting', () => {
  it('writes amounts as plain decimals, never currency strings', () => {
    expect(formatCentsPlain(38_900)).toBe('389.00')
    expect(formatCentsPlain(7)).toBe('0.07')
    expect(formatCentsPlain(0)).toBe('0.00')
    expect(formatCentsPlain(100)).toBe('1.00')
    expect(formatCentsPlain(1_234_567)).toBe('12345.67')
  })

  it('avoids floating point drift on values that trip naive division', () => {
    // 1097 / 100 is 10.969999999999999 in binary floating point.
    expect(formatCentsPlain(1_097)).toBe('10.97')
    expect(formatCentsPlain(1_000_000_000)).toBe('10000000.00')
  })

  it('writes commission rates as plain percentages', () => {
    expect(formatBasisPointsPlain(500)).toBe('5.00')
    expect(formatBasisPointsPlain(375)).toBe('3.75')
    expect(formatBasisPointsPlain(0)).toBe('0.00')
  })
})

describe('escaping (RFC 4180)', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsvCell('Primary Sale')).toBe('Primary Sale')
    expect(escapeCsvCell('389.00')).toBe('389.00')
    expect(escapeCsvCell('')).toBe('')
  })

  it('quotes and doubles embedded quotes', () => {
    expect(escapeCsvCell('He said "yes"')).toBe('"He said ""yes"""')
  })

  it('quotes commas and newlines', () => {
    expect(escapeCsvCell('Aeration, Overseeding')).toBe('"Aeration, Overseeding"')
    expect(escapeCsvCell('line one\nline two')).toBe('"line one\nline two"')
    expect(escapeCsvCell('line one\r\nline two')).toBe('"line one\r\nline two"')
  })

  it('quotes values with edge whitespace so spreadsheets do not trim them', () => {
    expect(escapeCsvCell('  padded  ')).toBe('"  padded  "')
  })

  it('neutralises formula injection', () => {
    // Excel and Sheets execute these on open unless they are prefixed.
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('+HYPERLINK("http://evil","click")')).toBe(
      '"\'+HYPERLINK(""http://evil"",""click"")"',
    )
    expect(escapeCsvCell('-2+3')).toBe("'-2+3")
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvCell('\t=cmd')).toBe('"\'\t=cmd"')
  })
})

describe('exportSalesCsv', () => {
  it('emits the spec §41 header row', () => {
    const csv = exportSalesCsv([], categories, settings)
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual([...CSV_COLUMNS])
  })

  it('writes one row per sale, in chronological order', () => {
    const csv = exportSalesCsv(
      [
        sale({ id: 'b', date: '2026-09-04', time: '16:00', amount: 10_000 }),
        sale({ id: 'a', date: '2026-09-04', time: '09:00', amount: 20_000 }),
        sale({ id: 'c', date: '2026-08-31', time: '23:59', amount: 30_000 }),
      ],
      categories,
      settings,
    )
    const rows = parseCsv(csv)

    expect(rows).toHaveLength(4)
    expect(rows.slice(1).map((r) => r[2])).toEqual(['300.00', '200.00', '100.00'])
  })

  it('fills every column correctly', () => {
    const csv = exportSalesCsv([sale({ note: 'Spring program' })], categories, settings)
    const [, row] = parseCsv(csv)

    expect(row).toEqual([
      '2026-09-04',
      '14:32',
      '389.00',
      'Primary Sale',
      'Active',
      '5.00',
      '19.45',
      'Spring program',
      // Net Amount — for an untouched sale it is the recorded amount.
      '389.00',
    ])
  })

  it('labels uncategorised and unknown categories rather than leaving a blank', () => {
    const csv = exportSalesCsv(
      [sale({ id: 'x', categoryId: null }), sale({ id: 'y', categoryId: 'deleted-cat' })],
      categories,
      settings,
    )
    const rows = parseCsv(csv)
    expect(rows[1][3]).toBe('Uncategorized')
    expect(rows[2][3]).toBe('Uncategorized')
  })

  it('keeps cancelled sales visible with their original amount (§18)', () => {
    const csv = exportSalesCsv(
      [
        sale({
          status: 'cancelled',
          cancellation: { cancelledOn: '2026-09-06', reason: 'Cancelled', cancelledAt: 1 },
        }),
      ],
      categories,
      settings,
    )
    const [, row] = parseCsv(csv)
    expect(row[2]).toBe('389.00')
    expect(row[4]).toBe('Cancelled')
  })

  it('blanks the commission columns when the user is not tracking commission', () => {
    const csv = exportSalesCsv([sale()], categories, { ...settings, commissionEnabled: false })
    const [, row] = parseCsv(csv)

    expect(row[5]).toBe('')
    expect(row[6]).toBe('')
    expect(row[2]).toBe('389.00')
  })

  it('terminates records with CRLF', () => {
    const csv = exportSalesCsv([sale()], categories, settings)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2)
  })
})

describe('round trip', () => {
  it('a note with quotes, commas and newlines survives export and re-parse', () => {
    const nasty = 'Said "no, thanks",\nthen called back\r\nnext day, said "yes"'
    const csv = exportSalesCsv([sale({ note: nasty })], categories, settings)

    const rows = parseCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[1][7]).toBe(nasty)
  })

  it('a category name containing a comma does not shift the columns', () => {
    const csv = exportSalesCsv([sale({ categoryId: 'cat-2' })], categories, settings)
    const [header, row] = parseCsv(csv)

    expect(row).toHaveLength(header.length)
    expect(row[3]).toBe('Upsell, Renewal')
    expect(row[4]).toBe('Active')
  })

  it('a formula-looking note round-trips as text with its guard prefix', () => {
    const csv = exportSalesCsv([sale({ note: '=2+5+cmd|\' /C calc\'!A0' })], categories, settings)
    const [, row] = parseCsv(csv)

    // The value read back is inert: it starts with an apostrophe, not '='.
    expect(row[7].startsWith("'=")).toBe(true)
    expect(row[7]).toContain('2+5+cmd')
  })

  it('every field of a full export re-parses to the same column count', () => {
    const sales: Sale[] = Array.from({ length: 25 }, (_, i) =>
      sale({
        id: `s-${i}`,
        amount: 1_000 + i * 999,
        date: `2026-0${(i % 9) + 1}-1${i % 10}`,
        time: `0${i % 10}:0${i % 6}`,
        categoryId: i % 3 === 0 ? null : categories[i % 2].id,
        note: i % 2 === 0 ? `Note ${i}, "quoted"\nsecond line` : null,
        status: i % 7 === 0 ? 'cancelled' : 'active',
        cancellation:
          i % 7 === 0 ? { cancelledOn: '2026-09-01', reason: 'Changed mind, again', cancelledAt: 1 } : null,
      }),
    )

    const rows = parseCsv(exportSalesCsv(sales, categories, settings))
    expect(rows).toHaveLength(26)
    for (const row of rows) expect(row).toHaveLength(CSV_COLUMNS.length)
  })
})

/**
 * The export has to tie to what the app itself reports. `totalsFor` counts
 * nothing for a cancelled sale and re-derives an adjusted sale's commission
 * from the revised amount at the sale's own frozen rate (§18, §69); exporting
 * the frozen `commissionAmount` and the original `amount` meant a spreadsheet
 * reconciliation against Estimated Commission and Net Sales did not add up.
 */
describe('effective figures tie to the app (§18, §69)', () => {
  const COL = Object.fromEntries(CSV_COLUMNS.map((name, i) => [name, i])) as Record<
    (typeof CSV_COLUMNS)[number],
    number
  >

  /** $389.00 written down to $200.00, frozen at 5%. */
  const adjusted = () =>
    sale({ id: 'adj', status: 'adjusted', adjustedAmount: 20_000 })

  it('an adjusted sale exports the commission the app counts, not the frozen one', () => {
    const [, row] = parseCsv(exportSalesCsv([adjusted()], categories, settings))

    // The app re-derives 5% of the $200 that still stands.
    expect(row[COL['Estimated Commission']]).toBe('10.00')
    expect(row[COL['Estimated Commission']]).not.toBe('19.45')
    expect(effectiveCommission(adjusted())).toBe(1_000)
  })

  it('an adjusted sale keeps the original amount and reports the revised one separately', () => {
    const [, row] = parseCsv(exportSalesCsv([adjusted()], categories, settings))

    expect(row[COL.Amount]).toBe('389.00')
    expect(row[COL['Net Amount']]).toBe('200.00')
    expect(row[COL.Status]).toBe('Adjusted')
  })

  it('the frozen rate is exported unchanged — an adjustment never revisits it', () => {
    const [, row] = parseCsv(exportSalesCsv([adjusted()], categories, settings))
    expect(row[COL['Commission Rate']]).toBe('5.00')
  })

  it('a cancelled sale stays visible at full value but counts for nothing', () => {
    const cancelled = sale({
      id: 'can',
      status: 'cancelled',
      cancellation: { cancelledOn: '2026-09-06', reason: null, cancelledAt: 1 },
    })
    const [, row] = parseCsv(exportSalesCsv([cancelled], categories, settings))

    expect(row[COL.Amount]).toBe('389.00')
    expect(row[COL['Net Amount']]).toBe('0.00')
    expect(row[COL['Estimated Commission']]).toBe('0.00')
  })

  it('the Net Amount column sums to the net sales the app reports', () => {
    const sales: Sale[] = [
      sale({ id: 'a' }),
      adjusted(),
      sale({
        id: 'c',
        status: 'cancelled',
        cancellation: { cancelledOn: '2026-09-06', reason: null, cancelledAt: 1 },
      }),
    ]
    const totals = totalsFor(sales)
    const rows = parseCsv(exportSalesCsv(sales, categories, settings)).slice(1)

    const netFromCsv = rows.reduce((sum, r) => sum + centsFrom(r[COL['Net Amount']]!), 0)
    const grossFromCsv = rows.reduce((sum, r) => sum + centsFrom(r[COL.Amount]!), 0)
    const commissionFromCsv = rows.reduce(
      (sum, r) => sum + centsFrom(r[COL['Estimated Commission']]!),
      0,
    )

    expect(netFromCsv).toBe(totals.netSales)
    expect(grossFromCsv).toBe(totals.grossSales)
    expect(commissionFromCsv).toBe(totals.estimatedCommission)
  })

  it('blanking the commission columns does not blank Net Amount', () => {
    const [, row] = parseCsv(
      exportSalesCsv([adjusted()], categories, { ...settings, commissionEnabled: false }),
    )
    expect(row[COL['Commission Rate']]).toBe('')
    expect(row[COL['Estimated Commission']]).toBe('')
    expect(row[COL['Net Amount']]).toBe('200.00')
  })
})

/** '200.00' -> 20000. Test-side only, so the export is checked against maths it does not share. */
function centsFrom(plain: string): number {
  const [whole = '0', fraction = '00'] = plain.split('.')
  const sign = whole.startsWith('-') ? -1 : 1
  return sign * (Math.abs(Number(whole)) * 100 + Number(fraction))
}

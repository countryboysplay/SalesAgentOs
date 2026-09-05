/**
 * SalesTrack — CSV export (spec §41).
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ CSV IS NOT A BACKUP.                                                      │
 * │                                                                           │
 * │ §41 is explicit about this. A CSV is a flattened, lossy view meant for    │
 * │ spreadsheets, tax reference and reporting. It drops record ids, goal      │
 * │ history, categories, settings and cancellation metadata, and there is no  │
 * │ CSV import path (§72). The only thing that can restore this app is the    │
 * │ JSON backup from `backup.ts`. Never present this file as a safety net.    │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Two correctness concerns drive the implementation:
 *
 *  - RFC 4180 escaping, so a note containing a quote, a comma or a newline
 *    round-trips through Excel, Numbers and Sheets unchanged.
 *  - Formula injection. A note that starts with `=`, `+`, `-` or `@` is
 *    executed as a formula by Excel and Sheets when the file is opened. Every
 *    such cell is prefixed with an apostrophe so it stays text.
 */

import { StorageError, downloadTextFile, todayIso } from './db'
import { effectiveAmount, effectiveCommission } from '../core/calc'
import type { Category, Cents, IsoDate, Sale, Settings } from '../core/types'

/**
 * Column order follows spec §41, with one column appended.
 *
 * `Amount` is the sale AS RECORDED, so the column still sums to gross and a
 * cancelled sale stays visible at its full value (§18). `Net Amount` is what
 * the sale actually contributes — 0 for a cancellation, the revised figure for
 * an adjustment — so that column sums to the net the app reports. Without it a
 * spreadsheet had no way to arrive at the same numbers the dashboard shows.
 *
 * It is appended rather than slotted in beside `Amount` because the position of
 * every existing column is part of the file's contract with whatever the user
 * has already built on top of it.
 */
export const CSV_COLUMNS = [
  'Date',
  'Time',
  'Amount',
  'Category',
  'Status',
  'Commission Rate',
  'Estimated Commission',
  'Note',
  'Net Amount',
] as const

/**
 * Byte order mark. Excel on Windows reads a BOM-less CSV as the system
 * codepage and mangles any non-ASCII note; every other reader ignores it.
 */
const UTF8_BOM = String.fromCharCode(0xfeff)

/** RFC 4180 says records are CRLF-terminated. Excel on Windows insists. */
const ROW_SEPARATOR = '\r\n'

/**
 * Characters that make a spreadsheet treat a cell as a formula. Tab and
 * carriage return are included because Excel strips them and then re-evaluates
 * what is left.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

const STATUS_LABELS: Record<Sale['status'], string> = {
  active: 'Active',
  cancelled: 'Cancelled',
  adjusted: 'Adjusted',
}

const UNCATEGORISED = 'Uncategorized'

export function csvFilename(date: IsoDate = todayIso()): string {
  return `SalesTrack-Sales-${date}.csv`
}

/**
 * Render sales as RFC 4180 CSV.
 *
 * Amounts are plain decimal numbers (`389.00`), never currency-formatted — a
 * spreadsheet has to be able to sum the column. `settings.currency` is
 * therefore intentionally not used here; the user knows their own currency.
 *
 * When `settings.commissionEnabled` is false the commission columns are left
 * blank rather than filled with numbers the user has chosen not to track. The
 * columns stay present so the file's shape is stable either way.
 *
 * The effective figures come from `core/calc`, not from a second reading of the
 * sale here. `Estimated Commission` used to be the FROZEN `commissionAmount`,
 * which is the right number for an untouched sale and the wrong one for a
 * cancelled or adjusted sale: the app counts nothing for a cancellation, and
 * re-derives an adjusted sale's commission from the revised amount at the
 * sale's own frozen rate (§69). Exporting the frozen figure meant a
 * reconciliation against the app's own Estimated Commission simply did not tie.
 */
export function exportSalesCsv(sales: Sale[], categories: Category[], settings: Settings): string {
  const categoryNames = new Map<string, string>()
  for (const category of categories) categoryNames.set(category.id, category.name)

  const ordered = [...sales].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.createdAt - b.createdAt,
  )

  const showCommission = settings.commissionEnabled !== false

  const rows: string[] = [CSV_COLUMNS.map(escapeCsvCell).join(',')]

  for (const sale of ordered) {
    const categoryName =
      sale.categoryId === null ? UNCATEGORISED : (categoryNames.get(sale.categoryId) ?? UNCATEGORISED)

    rows.push(
      [
        sale.date,
        sale.time,
        formatCentsPlain(sale.amount),
        categoryName,
        STATUS_LABELS[sale.status] ?? String(sale.status),
        showCommission ? formatBasisPointsPlain(sale.commissionRate) : '',
        showCommission ? formatCentsPlain(effectiveCommission(sale)) : '',
        sale.note ?? '',
        formatCentsPlain(effectiveAmount(sale)),
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }

  // Trailing separator so the file ends on a record boundary.
  return rows.join(ROW_SEPARATOR) + ROW_SEPARATOR
}

/**
 * Save the CSV to the user's device.
 *
 * A UTF-8 BOM is prepended here — and only here — because Excel on Windows
 * otherwise reads the file as the system codepage and mangles any non-ASCII
 * note. `exportSalesCsv` stays BOM-free so the string parses cleanly.
 */
export function downloadSalesCsv(
  sales: Sale[],
  categories: Category[],
  settings: Settings,
  date: IsoDate = todayIso(),
): { filename: string; rowCount: number } {
  if (sales.length === 0) {
    throw new StorageError('invalid-input', 'There are no sales on this device to export yet.')
  }
  const csv = exportSalesCsv(sales, categories, settings)
  const filename = csvFilename(date)
  downloadTextFile(filename, UTF8_BOM + csv, 'text/csv;charset=utf-8')
  return { filename, rowCount: sales.length }
}

// ---------------------------------------------------------------------------
// Cell formatting
// ---------------------------------------------------------------------------

/**
 * Integer cents to a plain decimal string: 38900 -> "389.00".
 *
 * Done with integer arithmetic rather than `cents / 100` so no value can pick
 * up a floating-point tail on the way out.
 */
export function formatCentsPlain(cents: Cents): string {
  if (!Number.isFinite(cents)) return '0.00'
  const rounded = Math.round(cents)
  const sign = rounded < 0 ? '-' : ''
  const absolute = Math.abs(rounded)
  const whole = Math.trunc(absolute / 100)
  const fraction = absolute % 100
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}`
}

/** Basis points to a plain percentage number: 500 -> "5.00", 375 -> "3.75". */
export function formatBasisPointsPlain(basisPoints: number): string {
  if (!Number.isFinite(basisPoints)) return '0.00'
  return formatCentsPlain(Math.round(basisPoints))
}

/**
 * RFC 4180 escaping plus formula-injection defence.
 *
 * A field is quoted when it contains a quote, a comma, CR, LF, or leading /
 * trailing whitespace (which spreadsheets otherwise trim). Embedded quotes are
 * doubled. The formula guard runs first so the apostrophe lands inside the
 * quotes where the spreadsheet will see it.
 *
 * The whitespace test looks at the ORIGINAL value as well as the guarded one:
 * a note starting with a tab would otherwise stop looking like edge whitespace
 * once the guard prefix is added, and the tab would be silently trimmed away by
 * the spreadsheet on import.
 */
export function escapeCsvCell(value: string): string {
  const raw = value ?? ''
  const guarded = FORMULA_PREFIXES.some((prefix) => raw.startsWith(prefix)) ? `'${raw}` : raw

  const needsQuoting =
    guarded.includes('"') ||
    guarded.includes(',') ||
    guarded.includes('\n') ||
    guarded.includes('\r') ||
    guarded !== guarded.trim() ||
    raw !== raw.trim()

  return needsQuoting ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/**
 * Minimal RFC 4180 reader. Exists so the escaping above can be proved to
 * round-trip in tests; the app itself never imports CSV (§72).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (char === '\r' && text[i + 1] === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 2
      continue
    }
    if (char === '\n' || char === '\r') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }

    field += char
    i += 1
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/**
 * Small, screen-local helpers shared by the Add Sale sheet and Sale Details.
 *
 * Nothing here computes a metric — that all lives in src/core/calc. These are
 * input parsing, unit presentation, and one ordering (which categories the
 * agent used most recently).
 */
import { useMemo } from 'react'
import { parseAmountToCents } from '@/core/money'
import { formatCurrency } from '@/core/format'
import type { FormatSettings } from '@/core/format'
import type { BasisPoints, Category, Sale } from '@/core/types'

/** How far back the recent-category scan walks. Mirrors the repository's cap. */
const RECENT_SCAN_LIMIT = 200
const RECENT_CHIPS = 4

/**
 * A typed percentage to basis points, with no float maths of our own:
 * parseAmountToCents already turns '5' into 500 and '3.25' into 325, which is
 * exactly the basis-point scale (types.ts BasisPoints).
 */
export function parseRate(text: string): BasisPoints | null {
  const parsed = parseAmountToCents(text.trim())
  if (parsed === null || parsed < 0) return null
  return parsed
}

/**
 * Basis points back to the bare number a percent input holds: 500 -> '5',
 * 325 -> '3.25'. Display strings elsewhere go through formatBasisPoints; this
 * exists only because an <input> cannot hold a localised '5%'.
 */
export function rateToText(basisPoints: BasisPoints): string {
  const whole = Math.trunc(basisPoints / 100)
  const remainder = basisPoints - whole * 100
  if (remainder === 0) return String(whole)
  return `${whole}.${String(remainder).padStart(2, '0').replace(/0$/, '')}`
}

/**
 * Explicit override -> the sale's own frozen rate when editing -> the
 * category rule -> the global default. Mirrors the repository's
 * resolveCommissionRate so the estimate on screen equals the rate that is
 * frozen onto the record (§69).
 */
export function resolveRate(
  typed: BasisPoints | null,
  editing: Sale | null,
  category: Category | null,
  fallback: BasisPoints,
): BasisPoints {
  if (typed !== null) return typed
  if (editing) return editing.commissionRate
  if (category && category.commissionRate !== null) return category.commissionRate
  return fallback
}

/**
 * What happens to a per-sale rate override when the category changes.
 *
 * An override is the agent's answer to "what is this sale worth", and a
 * category carrying its own commission rule is a different answer to the same
 * question — so picking Upsell after overriding Primary Sale must not leave the
 * old figure frozen onto the record (§69). A category with no rule of its own
 * changes nothing, so the override stands.
 *
 * `override` and the return value are the raw text of the rate field; null
 * means "no override, follow the normal rule".
 */
export function rateOverrideForCategory(
  override: string | null,
  nextCategory: Category | null,
): string | null {
  if (override === null) return null
  if (nextCategory && nextCategory.commissionRate !== null) return null
  return override
}

/* ------------------------------------------------- keypad presentation (§55) */

/**
 * Every kind of space Intl puts between a figure and its currency glyph.
 * \s already covers the no-break (U+00A0) and narrow no-break (U+202F) spaces
 * that fr-FR and sv-SE use there.
 */
const SPACES = /\s+/g

/**
 * The currency glyph for these settings: '$', '£', '€', 'kr'.
 *
 * Read out of formatCurrency rather than hard-coded, because the glyph is
 * neither always leading nor always a symbol — fr-FR/EUR renders "0 €" and
 * sv-SE/SEK renders "0 kr". Formatting a zero and keeping what is not a digit
 * asks Intl for it without a second formatter of our own.
 */
export function currencySymbol(settings: FormatSettings): string {
  return formatCurrency(0, settings, { decimals: 'never' }).replace(/\d/g, '').replace(SPACES, '')
}

/**
 * The bare figure for the keypad display — "389.00", "389,00" — since
 * KeypadDisplay renders the glyph itself.
 *
 * formatCurrency stays the render boundary, so group and decimal separators
 * remain locale-correct; only the glyph comes off, wherever the locale puts it.
 * Stripping a leading run of non-digits instead left "389,00 €" with its symbol
 * still attached and a hard-coded '$' pinned in front of it.
 */
export function plainAmount(cents: number, settings: FormatSettings, symbol: string): string {
  return formatCurrency(cents, settings, { decimals: 'always' }).replace(symbol, '').trim()
}

/**
 * Recently-used categories for the §14 quick chips, padded from the configured
 * list so a fresh install still shows something to tap.
 *
 * This is an ordering over rows already in memory, not a metric — the store has
 * no recent-category selector, and the repository's async one must not be
 * called from a screen (design system rule 2).
 */
export function useRecentCategories(
  sortedSales: readonly Sale[],
  categoriesById: ReadonlyMap<string, Category>,
  activeCategories: readonly Category[],
): Category[] {
  return useMemo(() => {
    const out: Category[] = []
    const seen = new Set<string>()

    const limit = Math.min(sortedSales.length, RECENT_SCAN_LIMIT)
    for (let i = 0; i < limit && out.length < RECENT_CHIPS; i += 1) {
      const id = sortedSales[i].categoryId
      if (!id || seen.has(id)) continue
      const category = categoriesById.get(id)
      if (!category || !category.active) continue
      seen.add(id)
      out.push(category)
    }

    for (const category of activeCategories) {
      if (out.length >= RECENT_CHIPS) break
      if (seen.has(category.id)) continue
      seen.add(category.id)
      out.push(category)
    }

    return out
  }, [sortedSales, categoriesById, activeCategories])
}

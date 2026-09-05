/**
 * Empty states for the ledger — §57.
 *
 * Three cases, in priority order, none of which look broken:
 *   1. nothing has ever been recorded  -> "Your sales history will appear here."
 *   2. filters are hiding everything   -> say so, and offer the way out
 *   3. this period happens to be empty -> the per-view line
 *
 * Copy rules: never apologise, never say "no data", never mention loading or
 * connection.
 */
import type { ReactNode } from 'react'
import { Button, EmptyState } from '@/components'

export interface LedgerEmptyProps {
  /** Sales in the whole ledger, before any filtering. */
  totalSaleCount: number
  filtersActive: boolean
  onClearFilters: () => void
  /** Shown when there is history and no filters — the per-view wording. */
  fallback: ReactNode
}

export function LedgerEmpty({
  totalSaleCount,
  filtersActive,
  onClearFilters,
  fallback,
}: LedgerEmptyProps) {
  if (totalSaleCount === 0) {
    return (
      <EmptyState
        title="Your sales history will appear here."
        body="Every sale you record is kept on this device."
      />
    )
  }

  if (filtersActive) {
    return (
      <EmptyState
        title="Nothing matches these filters."
        body="Widen the range or clear a filter to see more of your history."
        action={
          <Button variant="secondary" size="md" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    )
  }

  return <>{fallback}</>
}

export default LedgerEmpty

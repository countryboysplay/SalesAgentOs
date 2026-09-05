/**
 * Search and filtering — §71.
 *
 * Deliberately small: a search box that reads notes, and one sheet with four
 * facets (date range, category, status, amount range). The spec is explicit
 * that this must not grow into query building, so there are no operators, no
 * saved searches and no boolean logic.
 */
import { useId, useState } from 'react'
import { Button, Chip, ChipRow, Sheet } from '@/components'
import type { Category, SaleStatus } from '@/core/types'
import {
  ALL_STATUSES,
  EMPTY_FILTERS,
  STATUS_LABEL,
  UNCATEGORISED,
  activeFilterCount,
  amountFieldError,
  describeFilters,
  type SaleFilters,
} from './ledger'

const SearchIcon = () => (
  <svg className="filters__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="8.6" cy="8.6" r="5.4" />
    <path d="M12.6 12.6 17 17" />
  </svg>
)

const FilterIcon = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M3 5.5h14M6 10h8M8.5 14.5h3" />
  </svg>
)

export interface FilterBarProps {
  filters: SaleFilters
  onChange: (filters: SaleFilters) => void
  categories: readonly Category[]
  /**
   * Sales counted in the matching rows — `totalsFor(...).saleCount` from calc,
   * which excludes cancellations exactly as every other figure does (§18).
   */
  matchCount: number
  /**
   * Matching rows that are cancelled. They stay on screen (§18) but contribute
   * nothing to `matchCount`, so the summary names them separately rather than
   * quietly counting them as sales the card below says are worth $0.
   */
  cancelledCount: number
  categoriesById: ReadonlyMap<string, Category>
}

export function FilterBar({
  filters,
  onChange,
  categories,
  matchCount,
  cancelledCount,
  categoriesById,
}: FilterBarProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SaleFilters>(filters)
  const minErrorId = useId()
  const maxErrorId = useId()

  const count = activeFilterCount(filters)
  const summary = describeFilters(filters, categoriesById)

  const matchText = `${matchCount} ${matchCount === 1 ? 'sale' : 'sales'}`
  const countText = cancelledCount > 0 ? `${matchText} · ${cancelledCount} cancelled` : matchText

  // An unparseable amount narrows nothing, so it must not be applied silently.
  const minError = amountFieldError(draft.minAmount)
  const maxError = amountFieldError(draft.maxAmount)
  const amountInvalid = minError !== null || maxError !== null

  const openSheet = () => {
    setDraft(filters)
    setOpen(true)
  }

  const toggleCategory = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id)
        ? prev.categoryIds.filter((value) => value !== id)
        : [...prev.categoryIds, id],
    }))
  }

  const toggleStatus = (status: SaleStatus) => {
    setDraft((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter((value) => value !== status)
        : [...prev.statuses, status],
    }))
  }

  return (
    <>
      <div className="filters">
        <div className="filters__search">
          <SearchIcon />
          <input
            className="filters__input"
            type="search"
            value={filters.query}
            placeholder="Search notes and categories"
            aria-label="Search sale notes and category names"
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
          />
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={openSheet}
          icon={<FilterIcon />}
          ariaLabel={count > 0 ? `Filters, ${count} active` : 'Filters'}
        >
          <span aria-hidden="true">
            Filters
            {count > 0 ? <span className="filters__count">{count}</span> : null}
          </span>
        </Button>
      </div>

      {count > 0 && (
        <p className="filters__summary">
          <span>
            {`${countText} · ${summary.join(' · ')}`}
          </span>
          <Button variant="ghost" size="md" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear
          </Button>
        </p>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter Sales"
        description="Narrow the ledger. Filters apply to every tab."
        footer={
          <Button
            variant="primary"
            size="lg"
            block
            aria-disabled={amountInvalid}
            onClick={() => {
              // Kept focusable rather than `disabled` so a screen reader can
              // still reach the button and be told why nothing happened.
              if (amountInvalid) return
              onChange(draft)
              setOpen(false)
            }}
          >
            Apply Filters
          </Button>
        }
      >
        <div className="filterform">
          <fieldset className="filterform__group">
            <legend className="filterform__legend">Date range</legend>
            <div className="filterform__pair">
              <label className="filterform__field">
                <span>From</span>
                <input
                  className="filterform__control"
                  type="date"
                  value={draft.from}
                  onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                />
              </label>
              <label className="filterform__field">
                <span>To</span>
                <input
                  className="filterform__control"
                  type="date"
                  value={draft.to}
                  onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                />
              </label>
            </div>
          </fieldset>

          <div className="filterform__group">
            <span className="filterform__legend">Category</span>
            <ChipRow wrap label="Filter by category">
              {categories.map((category) => (
                <Chip
                  key={category.id}
                  selected={draft.categoryIds.includes(category.id)}
                  onClick={() => toggleCategory(category.id)}
                  icon={category.icon ?? undefined}
                >
                  {category.name}
                </Chip>
              ))}
              <Chip
                selected={draft.categoryIds.includes(UNCATEGORISED)}
                onClick={() => toggleCategory(UNCATEGORISED)}
              >
                Uncategorised
              </Chip>
            </ChipRow>
          </div>

          <div className="filterform__group">
            <span className="filterform__legend">Status</span>
            <ChipRow wrap label="Filter by status">
              {ALL_STATUSES.map((status) => (
                <Chip
                  key={status}
                  selected={draft.statuses.includes(status)}
                  onClick={() => toggleStatus(status)}
                >
                  {STATUS_LABEL[status]}
                </Chip>
              ))}
            </ChipRow>
          </div>

          <fieldset className="filterform__group">
            <legend className="filterform__legend">Amount range</legend>
            <div className="filterform__pair">
              <label className="filterform__field">
                <span>Least</span>
                <input
                  className={`filterform__control${minError ? ' filterform__control--invalid' : ''}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={draft.minAmount}
                  aria-invalid={minError !== null}
                  aria-describedby={minError ? minErrorId : undefined}
                  onChange={(event) => setDraft({ ...draft, minAmount: event.target.value })}
                />
                {minError && (
                  <span className="filterform__error" id={minErrorId} role="alert">
                    {minError}
                  </span>
                )}
              </label>
              <label className="filterform__field">
                <span>Most</span>
                <input
                  className={`filterform__control${maxError ? ' filterform__control--invalid' : ''}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="Any"
                  value={draft.maxAmount}
                  aria-invalid={maxError !== null}
                  aria-describedby={maxError ? maxErrorId : undefined}
                  onChange={(event) => setDraft({ ...draft, maxAmount: event.target.value })}
                />
                {maxError && (
                  <span className="filterform__error" id={maxErrorId} role="alert">
                    {maxError}
                  </span>
                )}
              </label>
            </div>
          </fieldset>

          <Button
            variant="ghost"
            size="md"
            block
            onClick={() => setDraft({ ...EMPTY_FILTERS, query: draft.query })}
          >
            Reset filters
          </Button>
        </div>
      </Sheet>
    </>
  )
}

export default FilterBar

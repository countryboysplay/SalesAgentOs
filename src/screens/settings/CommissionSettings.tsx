/**
 * Settings > Commission (§33).
 *
 * Two rules govern this screen:
 *
 *  1. Every figure is labelled ESTIMATED COMMISSION. SalesTrack is a tracker,
 *     not payroll software, and the copy never pretends otherwise.
 *  2. Rates are prospective (§69). A sale freezes its rate at write time, so
 *     changing the default or a category rule today cannot move a sale from
 *     March. The screen says so where the rate is edited, not in a footnote.
 *
 * Category rules ARE the category's `commissionRate`, so a rule and its
 * category can never drift apart.
 */
import { useState } from 'react'
import { Button, Card, useToast } from '@/components'
import { useActions, useCategories, useSettings } from '@/app/store'
import { ROUTES, useNavigate } from '@/app/router'
import { commissionFor } from '@/core/money'
import { formatBasisPoints, formatCurrency } from '@/core/format'
import type { Category, Settings } from '@/core/types'
import {
  KeyValue,
  Note,
  Row,
  SettingsPage,
  TextField,
  Toggle,
  basisPointsToInput,
  parsePercent,
  percentRejectionMessage,
} from './parts'

/** The sale size the worked example uses. $1,000 keeps the mental maths easy. */
const EXAMPLE_SALE = 100_000

export default function CommissionSettings() {
  const settings = useSettings()
  const { categories } = useCategories()
  const { saveSettings } = useActions()
  const { success } = useToast()
  const navigate = useNavigate()

  const [draft, setDraft] = useState(() => basisPointsToInput(settings.defaultCommissionRate))
  const [submitError, setSubmitError] = useState<string | null>(null)

  const parsed = parsePercent(draft)
  const draftRate = parsed.ok ? parsed.basisPoints : null

  /**
   * A rejected value is explained the moment it is rejected, not on submit.
   *
   * This is the escape from a dead end that was genuinely unrecoverable: a rate
   * stored above the cap (onboarding used to accept 500%) rendered as "500" in
   * this field, failed to parse, left Save disabled, and said nothing about
   * why. The field now states the problem, and Save stays reachable for as long
   * as there is something to fix.
   */
  const liveError = parsed.ok || parsed.reason === 'empty' ? null : percentRejectionMessage(parsed.reason)
  const error = submitError ?? liveError

  const stored = basisPointsToInput(settings.defaultCommissionRate)
  const dirty = !parsed.ok || draft.trim() !== stored

  function saveDefault() {
    if (!parsed.ok) {
      setSubmitError(percentRejectionMessage(parsed.reason))
      return
    }
    setSubmitError(null)
    const rate = parsed.basisPoints
    // Normalise what is on screen to what was stored, so '5.00' does not keep
    // reading as an unsaved change.
    setDraft(basisPointsToInput(rate))
    if (rate === settings.defaultCommissionRate) return

    saveSettings({ defaultCommissionRate: rate })
    success('Default rate updated', {
      detail: `${formatBasisPoints(rate, settings)} on sales recorded from now on`,
      key: 'commission-default',
    })
  }

  const withRules = categories.filter((c) => c.commissionRate !== null)

  return (
    <SettingsPage
      title="Commission"
      subtitle="Estimated commission rates"
      storedLocally
    >
      <Card
        title="Track estimated commission"
        headerAction={
          <Toggle
            checked={settings.commissionEnabled}
            onChange={(next) => {
              saveSettings({ commissionEnabled: next })
              success(next ? 'Estimated commission shown' : 'Estimated commission hidden', {
                key: 'commission-enabled',
              })
            }}
            label="Track estimated commission"
          />
        }
      >
        <Note>
          When this is on, SalesTrack shows an <strong>Estimated Commission</strong> figure
          alongside your sales. It is an estimate for your own reference — it is not a pay
          statement, and it does not account for splits, clawbacks, draws or taxes.
        </Note>
      </Card>

      {settings.commissionEnabled && (
        <>
          <Card title="Default rate">
            <div className="shell-stack">
              <TextField
                required
                label="Rate applied when nothing more specific is set"
                value={draft}
                onChange={(v) => {
                  setDraft(v)
                  setSubmitError(null)
                }}
                onEnter={saveDefault}
                suffix="%"
                inputMode="decimal"
                numeric
                className="set-field--wide"
                placeholder="5"
                error={error}
              />

              <div className="set-preview">
                <p className="set-preview__line">
                  <span className="set-preview__marker">Example</span>
                  <span>
                    A {formatCurrency(EXAMPLE_SALE, settings)} sale at{' '}
                    {formatBasisPoints(draftRate ?? settings.defaultCommissionRate, settings)} ={' '}
                    {formatCurrency(
                      commissionFor(EXAMPLE_SALE, draftRate ?? settings.defaultCommissionRate),
                      settings,
                    )}{' '}
                    estimated commission
                  </span>
                </p>
              </div>

              <Note>
                <strong>A new rate applies to sales you record from now on.</strong> Every sale
                stores the rate it was recorded at, so changing this cannot alter a sale from
                March — or the estimated commission any past month has already been credited with.
              </Note>

              <div className="set-actions set-actions--hug">
                <Button variant="primary" onClick={saveDefault} disabled={!dirty}>
                  Save default rate
                </Button>
                {dirty && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDraft(stored)
                      setSubmitError(null)
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card
            title="Rates by category"
            headerAction={
              <Button size="sm" variant="ghost" onClick={() => navigate(ROUTES.settingsCategories)}>
                Manage categories
              </Button>
            }
          >
            <div className="shell-stack">
              <Note>
                A category can carry its own rate — Program Sales at 5%, Upsells at 3%. Leave a
                category blank and it uses the default. An individual sale can still override both
                when you record it.
              </Note>

              <div>
                {categories.filter((c) => c.active).map((category) => (
                  <CategoryRateRow key={category.id} category={category} settings={settings} />
                ))}
              </div>

              {categories.filter((c) => c.active).length === 0 && (
                <Note quiet>
                  There are no active categories yet. Add one under Manage categories to give it
                  its own rate.
                </Note>
              )}
            </div>
          </Card>

          <Card title="What is in force now" tone="flat">
            <KeyValue
              label="Default"
              value={formatBasisPoints(settings.defaultCommissionRate, settings)}
            />
            {withRules.map((category) => (
              <KeyValue
                key={category.id}
                label={
                  <>
                    {category.name}
                    {!category.active && (
                      <>
                        {' '}
                        <span className="set-badge">Inactive</span>
                      </>
                    )}
                  </>
                }
                value={formatBasisPoints(category.commissionRate ?? 0, settings)}
              />
            ))}
            <Note quiet>
              A rate is resolved in this order: the rate typed on the sale, then the category rule,
              then the default. Whichever wins is frozen onto the sale and never revisited.
            </Note>
          </Card>
        </>
      )}
    </SettingsPage>
  )
}

/** One category's optional rule. Empty means "use the default". */
function CategoryRateRow({ category, settings }: { category: Category; settings: Settings }) {
  const { updateCategory } = useActions()
  const { success, error: errorToast } = useToast()
  const [draft, setDraft] = useState(() =>
    category.commissionRate === null ? '' : basisPointsToInput(category.commissionRate),
  )

  function commit() {
    const trimmed = draft.trim()

    if (trimmed === '') {
      if (category.commissionRate === null) return
      updateCategory(category.id, { commissionRate: null })
      success(`${category.name} uses the default rate`, { key: `rate-${category.id}` })
      return
    }

    const parsed = parsePercent(trimmed)
    if (!parsed.ok) {
      setDraft(category.commissionRate === null ? '' : basisPointsToInput(category.commissionRate))
      // Always say what was wrong with the value — the field has just reverted
      // under the user's hands, and an unexplained revert is indistinguishable
      // from a bug.
      errorToast(percentRejectionMessage(parsed.reason, { blankAllowed: true }), {
        key: `rate-${category.id}`,
      })
      return
    }
    const rate = parsed.basisPoints
    if (rate === category.commissionRate) return

    updateCategory(category.id, { commissionRate: rate })
    success(`${category.name} set to ${formatBasisPoints(rate, settings)}`, {
      detail: 'Applies to sales recorded from now on',
      key: `rate-${category.id}`,
    })
  }

  return (
    <Row
      label={
        <>
          {category.icon ? `${category.icon} ` : ''}
          {category.name}
        </>
      }
      sub={
        category.commissionRate === null
          ? `Uses the default, ${formatBasisPoints(settings.defaultCommissionRate, settings)}`
          : `Estimated commission on ${formatCurrency(EXAMPLE_SALE, settings)}: ${formatCurrency(commissionFor(EXAMPLE_SALE, category.commissionRate), settings)}`
      }
      control={
        <div className="set-field set-field--inline" onBlur={commit}>
          <label className="sr-only" htmlFor={`rate-${category.id}`}>
            {category.name} commission rate, percent
          </label>
          <div className="set-inputwrap">
            <input
              id={`rate-${category.id}`}
              className="set-input set-input--numeric"
              type="text"
              inputMode="decimal"
              value={draft}
              placeholder={basisPointsToInput(settings.defaultCommissionRate)}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
            />
            <span className="set-inputwrap__affix" aria-hidden="true">
              %
            </span>
          </div>
        </div>
      }
    />
  )
}

/**
 * Settings > Sale Categories (§34).
 *
 * The rule that shapes this screen: INACTIVE CATEGORIES STAY ATTACHED TO THEIR
 * OLD SALES. A category is not a label you can peel off history — it is part of
 * what a past month means. So:
 *
 *  - Deactivating is the normal way to retire a category, and the confirmation
 *    says plainly that existing sales keep it.
 *  - Delete is offered ONLY for a category no sale references. The repository
 *    independently downgrades a delete to a deactivate if a sale slips in
 *    first, and this screen reports whichever outcome actually happened rather
 *    than claiming the one it asked for.
 */
import { useMemo, useState } from 'react'
import { Button, Card, ConfirmDialog, EmptyState, Sheet, useToast } from '@/components'
import { useActions, useCategories, useSales, useSettings } from '@/app/store'
import { deleteCategory } from '@/data'
import { formatBasisPoints, formatNumber } from '@/core/format'
import type { Category, Settings } from '@/core/types'
import { reorderWrites } from './categoryOrder'
import {
  ArrowDown,
  ArrowUp,
  Note,
  PencilIcon,
  Row,
  SettingsPage,
  TextField,
  Toggle,
  basisPointsToInput,
  parsePercent,
  percentRejectionMessage,
} from './parts'

type Editing = { mode: 'create' } | { mode: 'edit'; category: Category } | null

export default function CategoriesSettings() {
  const settings = useSettings()
  const { categories } = useCategories()
  const { sales } = useSales()
  const { addCategory, updateCategory, reload } = useActions()
  const { success, error: errorToast } = useToast()

  const [editing, setEditing] = useState<Editing>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<Category | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null)

  /** How many sales reference each category — cancelled ones included: they are history too. */
  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const sale of sales) {
      if (sale.categoryId === null) continue
      counts.set(sale.categoryId, (counts.get(sale.categoryId) ?? 0) + 1)
    }
    return counts
  }, [sales])

  const ordered = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt),
    [categories],
  )
  const active = ordered.filter((c) => c.active)
  const inactive = ordered.filter((c) => !c.active)

  /**
   * Move a category past its neighbour in the active list.
   *
   * `reorderWrites` rewrites a dense sequence over the whole displayed order
   * rather than swapping two values — see categoryOrder.ts for why swapping
   * silently stops working after any category is deleted.
   */
  function move(category: Category, direction: -1 | 1) {
    const index = active.findIndex((c) => c.id === category.id)
    const neighbour = active[index + direction]
    if (!neighbour) return

    for (const write of reorderWrites(ordered, category.id, neighbour.id)) {
      updateCategory(write.id, { sortOrder: write.sortOrder })
    }
  }

  function setActive(category: Category, next: boolean) {
    updateCategory(category.id, { active: next })
    setConfirmDeactivate(null)
    setEditing(null)
    success(next ? `${category.name} is active again` : `${category.name} deactivated`, {
      detail: next
        ? 'It appears again when you record a sale.'
        : `${formatNumber(usage.get(category.id) ?? 0, settings)} sales keep this category.`,
      key: `category-${category.id}`,
    })
  }

  /**
   * Delete a category with no history. The repository is the authority on
   * whether that is still true at write time, so its answer is what gets
   * reported — a silent downgrade to a deactivate would be a lie.
   */
  async function removeCategory(category: Category) {
    setConfirmDelete(null)
    setEditing(null)
    try {
      const result = await deleteCategory(category.id)
      await reload()
      if (result.outcome === 'deleted') {
        success(`${category.name} deleted`, { key: `category-${category.id}` })
      } else {
        success(`${category.name} deactivated instead of deleted`, {
          detail: `${formatNumber(result.referencingSales, settings)} sales still use it, so it was kept and switched off.`,
          duration: 7000,
          key: `category-${category.id}`,
        })
      }
    } catch (err) {
      errorToast(messageFor(err), { key: `category-${category.id}` })
    }
  }

  return (
    <SettingsPage title="Sale Categories" subtitle="How your sales are grouped" storedLocally>
      <Card tone="flat">
        <Note>
          Categories are yours to name. Keep them broad enough that recording a sale stays a
          one-tap decision — a long list slows down the thing this app exists to make fast.
        </Note>
      </Card>

      <Card
        title="Active"
        headerAction={
          <Button size="sm" variant="secondary" onClick={() => setEditing({ mode: 'create' })}>
            Add category
          </Button>
        }
      >
        {active.length === 0 ? (
          <EmptyState
            compact
            title="No active categories"
            body="Add one and it appears as a chip when you record a sale."
            action={
              <Button variant="secondary" onClick={() => setEditing({ mode: 'create' })}>
                Add category
              </Button>
            }
          />
        ) : (
          <div>
            {active.map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                settings={settings}
                saleCount={usage.get(category.id) ?? 0}
                canMoveUp={index > 0}
                canMoveDown={index < active.length - 1}
                onMoveUp={() => move(category, -1)}
                onMoveDown={() => move(category, 1)}
                onEdit={() => setEditing({ mode: 'edit', category })}
              />
            ))}
          </div>
        )}
      </Card>

      {inactive.length > 0 && (
        <Card title="Inactive">
          <div className="shell-stack">
            <Note>
              These no longer appear when you record a sale. The sales already in them keep their
              category and still count in every report.
            </Note>
            <div>
              {inactive.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  settings={settings}
                  saleCount={usage.get(category.id) ?? 0}
                  canMoveUp={false}
                  canMoveDown={false}
                  onMoveUp={() => undefined}
                  onMoveDown={() => undefined}
                  onEdit={() => setEditing({ mode: 'edit', category })}
                />
              ))}
            </div>
          </div>
        </Card>
      )}

      <CategorySheet
        editing={editing}
        settings={settings}
        saleCount={
          editing?.mode === 'edit' ? (usage.get(editing.category.id) ?? 0) : 0
        }
        onClose={() => setEditing(null)}
        onCreate={(input) => {
          const created = addCategory(input)
          setEditing(null)
          success(`${created.name} added`, { key: 'category-new' })
        }}
        onSave={(id, patch, name) => {
          updateCategory(id, patch)
          setEditing(null)
          success(`${name} saved`, { key: `category-${id}` })
        }}
        onRequestDeactivate={(category) => setConfirmDeactivate(category)}
        onActivate={(category) => setActive(category, true)}
        onRequestDelete={(category) => setConfirmDelete(category)}
      />

      <ConfirmDialog
        open={confirmDeactivate !== null}
        tone="primary"
        title={`Deactivate ${confirmDeactivate?.name ?? 'this category'}?`}
        body={
          confirmDeactivate
            ? `It stops appearing when you record a sale. The ${formatNumber(usage.get(confirmDeactivate.id) ?? 0, settings)} sales already in this category keep it and still count in every report. You can switch it back on at any time.`
            : undefined
        }
        confirmLabel="Deactivate"
        onCancel={() => setConfirmDeactivate(null)}
        onConfirm={() => confirmDeactivate && setActive(confirmDeactivate, false)}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        tone="danger"
        title={`Delete ${confirmDelete?.name ?? 'this category'}?`}
        body="No sales use this category, so removing it changes nothing in your history. If a sale is recorded in it before this finishes, it will be kept and deactivated instead."
        confirmLabel="Delete category"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void removeCategory(confirmDelete)
        }}
      />
    </SettingsPage>
  )
}

/* ------------------------------------------------------------------- row */

interface CategoryRowProps {
  category: Category
  settings: Settings
  saleCount: number
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
}

function CategoryRow({
  category,
  settings,
  saleCount,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
}: CategoryRowProps) {
  const rate =
    category.commissionRate === null
      ? 'Default rate'
      : formatBasisPoints(category.commissionRate, settings)

  return (
    <div className="set-cat">
      <span className="set-cat__icon" aria-hidden="true">
        {category.icon ?? category.name.slice(0, 1).toUpperCase()}
      </span>

      <div className="set-cat__text">
        <div className="set-cat__name">
          {category.name}
          {!category.active && (
            <>
              {' '}
              <span className="set-badge">Inactive</span>
            </>
          )}
        </div>
        <div className="set-cat__meta">
          {rate} · {formatNumber(saleCount, settings)} {saleCount === 1 ? 'sale' : 'sales'}
        </div>
      </div>

      <div className="set-cat__actions">
        {category.active && (
          <>
            <button
              type="button"
              className="set-iconbtn"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              aria-label={`Move ${category.name} up`}
            >
              <ArrowUp />
            </button>
            <button
              type="button"
              className="set-iconbtn"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              aria-label={`Move ${category.name} down`}
            >
              <ArrowDown />
            </button>
          </>
        )}
        <button
          type="button"
          className="set-iconbtn"
          onClick={onEdit}
          aria-label={`Edit ${category.name}`}
        >
          <PencilIcon />
        </button>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- sheet */

interface CategorySheetProps {
  editing: Editing
  settings: Settings
  saleCount: number
  onClose: () => void
  onCreate: (input: { name: string; icon: string | null; commissionRate: number | null }) => void
  onSave: (
    id: string,
    patch: { name: string; icon: string | null; commissionRate: number | null },
    name: string,
  ) => void
  onRequestDeactivate: (category: Category) => void
  onActivate: (category: Category) => void
  onRequestDelete: (category: Category) => void
}

function CategorySheet({
  editing,
  settings,
  saleCount,
  onClose,
  onCreate,
  onSave,
  onRequestDeactivate,
  onActivate,
  onRequestDelete,
}: CategorySheetProps) {
  const category = editing?.mode === 'edit' ? editing.category : null
  // Keyed remount: a fresh draft every time a different category is opened.
  const key = editing === null ? 'closed' : (category?.id ?? 'new')

  return (
    <Sheet
      open={editing !== null}
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      description={
        category
          ? `${formatNumber(saleCount, settings)} ${saleCount === 1 ? 'sale uses' : 'sales use'} this category.`
          : 'Name it after something you sell, not after a product code.'
      }
    >
      <CategoryForm
        key={key}
        category={category}
        settings={settings}
        saleCount={saleCount}
        onCreate={onCreate}
        onSave={onSave}
        onRequestDeactivate={onRequestDeactivate}
        onActivate={onActivate}
        onRequestDelete={onRequestDelete}
      />
    </Sheet>
  )
}

interface CategoryFormProps {
  category: Category | null
  settings: Settings
  saleCount: number
  onCreate: CategorySheetProps['onCreate']
  onSave: CategorySheetProps['onSave']
  onRequestDeactivate: (category: Category) => void
  onActivate: (category: Category) => void
  onRequestDelete: (category: Category) => void
}

function CategoryForm({
  category,
  settings,
  saleCount,
  onCreate,
  onSave,
  onRequestDeactivate,
  onActivate,
  onRequestDelete,
}: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '')
  const [rate, setRate] = useState(
    category?.commissionRate == null ? '' : basisPointsToInput(category.commissionRate),
  )
  const [nameError, setNameError] = useState<string | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)

  function submit() {
    const trimmed = name.trim()
    if (trimmed === '') {
      setNameError('A category needs a name.')
      return
    }
    // Blank means "use the default" here, so only a non-empty value is parsed —
    // and when one is refused, the reason is stated on the field that holds the
    // offending value rather than under the name.
    const trimmedRate = rate.trim()
    const parsed = trimmedRate === '' ? null : parsePercent(trimmedRate)
    if (parsed !== null && !parsed.ok) {
      setRateError(percentRejectionMessage(parsed.reason, { blankAllowed: true }))
      return
    }
    setNameError(null)
    setRateError(null)

    const payload = {
      name: trimmed,
      icon: icon.trim() === '' ? null : icon.trim(),
      commissionRate: parsed === null ? null : parsed.basisPoints,
    }
    if (category) onSave(category.id, payload, trimmed)
    else onCreate(payload)
  }

  return (
    <div className="set-sheet-stack">
      <TextField
        required
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v)
          setNameError(null)
        }}
        onEnter={submit}
        placeholder="Lawn Program"
        maxLength={40}
        error={nameError}
      />

      <TextField
        label="Icon (optional)"
        value={icon}
        onChange={setIcon}
        onEnter={submit}
        placeholder="🌱"
        maxLength={2}
        hint="A single emoji, shown beside the name. Leave it blank for a plain initial."
      />

      <TextField
        label="Commission rate (optional)"
        value={rate}
        onChange={(v) => {
          setRate(v)
          setRateError(null)
        }}
        onEnter={submit}
        suffix="%"
        inputMode="decimal"
        numeric
        placeholder={basisPointsToInput(settings.defaultCommissionRate)}
        error={rateError}
        hint={`Leave blank to use the default, ${formatBasisPoints(settings.defaultCommissionRate, settings)}. A change applies to sales recorded from now on — sales already recorded keep their rate.`}
      />

      {category && (
        <>
          <hr />
          <Row
            label={category.active ? 'Active' : 'Inactive'}
            sub={
              category.active
                ? 'Appears as a chip when you record a sale.'
                : 'Hidden when recording a sale. Existing sales still use it.'
            }
            control={
              <Toggle
                checked={category.active}
                onChange={(next) => (next ? onActivate(category) : onRequestDeactivate(category))}
                label={`${category.name} active`}
              />
            }
          />

          {saleCount === 0 ? (
            <div>
              <Button variant="danger-quiet" onClick={() => onRequestDelete(category)}>
                Delete category
              </Button>
              <Note quiet>No sales use this category, so it can be removed outright.</Note>
            </div>
          ) : (
            <Note quiet>
              This category cannot be deleted: {formatNumber(saleCount, settings)}{' '}
              {saleCount === 1 ? 'sale is' : 'sales are'} recorded in it, and deleting it would
              leave that history without a name. Deactivate it instead.
            </Note>
          )}
        </>
      )}

      <div className="set-actions">
        <Button variant="primary" block onClick={submit}>
          {category ? 'Save category' : 'Add category'}
        </Button>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- errors */

function messageFor(err: unknown): string {
  if (err && typeof err === 'object' && 'userMessage' in err) {
    const message = (err as { userMessage?: unknown }).userMessage
    if (typeof message === 'string' && message.length > 0) return message
  }
  return 'That category could not be changed on this device.'
}

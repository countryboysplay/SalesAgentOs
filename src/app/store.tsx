import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AgentProfile,
  Category,
  Cents,
  Goal,
  GoalType,
  IsoDate,
  NewSaleInput,
  Sale,
  Settings,
} from '@/core/types'
import { goalFor as calcGoalFor } from '@/core/calc'
import { addDays } from '@/core/date'
import * as repo from '@/data'
import type { CategoryUpdate, NewCategoryInput, SaleUpdate } from '@/data'
import { useTheme } from './ThemeProvider'

/* =========================================================================
   SalesTrack store — the ONE place screens read and write application state.

   CONTRACT FOR SCREEN TEAMS
   1. Hydration happens once at boot, via repository.loadAll(). After
      `status === 'ready'` everything is in memory; there is no async read
      anywhere else in the app (§64). Never call the repository's read
      functions from a screen — the answer is already here.
   2. Every mutation is optimistic. State changes SYNCHRONOUSLY and the
      IndexedDB write happens after. Actions do not return promises you have
      to await before drawing. Once the write resolves, the store reconciles
      its optimistic row with the repository's authoritative record, so a
      frozen commission or a versioned goal is always the stored truth.
   3. If a write fails, `persistError` is set and the optimistic row is ROLLED
      BACK to the last known-good value, because a sale that appears saved but
      is not is the worst outcome in this product. The error carries a
      user-safe sentence (StorageError.userMessage).
   4. Screens never compute metrics here. Totals, pace, streaks and records
      live in `src/core/calc`. This store hands you rows and a few cheap
      indexes; the arithmetic belongs elsewhere (ARCHITECTURE invariant 6).
   5. Money stays integer cents, dates stay 'YYYY-MM-DD'. Nothing in this file
      formats anything — that is `src/core/format.ts`, at the render boundary.
   ========================================================================= */

/** Fallback used only before the first hydrate resolves. */
const BOOT_SETTINGS: Settings = repo.defaultSettings()

function userMessage(err: unknown): string {
  if (repo.isStorageError(err)) return err.userMessage
  return 'Something could not be saved to this device.'
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

/** Local 'YYYY-MM-DD' for defaulting a cancellation date. */
function todayIso(): IsoDate {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function tempId(prefix: string): string {
  return `${prefix}:pending:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
}

/* ---------------------------------------------------------------------- state */

export type StoreStatus = 'loading' | 'ready' | 'error'

/** A failed write, in a shape a screen can render without inspecting it. */
export interface PersistError {
  /** Plain-language sentence, safe to show the agent. */
  message: string
  /** Which action failed, e.g. 'addSale'. */
  action: string
  at: number
}

export interface StoreState {
  status: StoreStatus
  /** Set when the initial hydrate throws. App.tsx shows a recovery screen. */
  hydrateError: Error | null
  /** Most recent failed write. Cleared by dismissPersistError(). */
  persistError: PersistError | null
  profile: AgentProfile | null
  settings: Settings
  sales: Sale[]
  categories: Category[]
  goals: Goal[]
}

type Action =
  | { type: 'hydrated'; payload: repo.AppData }
  | { type: 'hydrate-failed'; error: Error }
  | { type: 'persist-failed'; error: PersistError }
  | { type: 'persist-error-cleared' }
  | { type: 'sale-added'; sale: Sale }
  | { type: 'sale-swapped'; fromId: string; sale: Sale }
  | { type: 'sale-replaced'; sale: Sale }
  | { type: 'sale-removed'; id: string }
  | { type: 'sale-restored'; sale: Sale }
  | { type: 'sales-set'; sales: Sale[] }
  | { type: 'category-upserted'; category: Category }
  | { type: 'category-swapped'; fromId: string; category: Category }
  | { type: 'categories-set'; categories: Category[] }
  | { type: 'goals-set'; goals: Goal[] }
  | { type: 'settings-set'; settings: Settings }
  | { type: 'profile-set'; profile: AgentProfile }

const INITIAL: StoreState = {
  status: 'loading',
  hydrateError: null,
  persistError: null,
  profile: null,
  settings: BOOT_SETTINGS,
  sales: [],
  categories: [],
  goals: [],
}

function upsertById<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some((r) => r.id === row.id)
    ? rows.map((r) => (r.id === row.id ? row : r))
    : [...rows, row]
}

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'hydrated':
      return {
        ...state,
        status: 'ready',
        hydrateError: null,
        profile: action.payload.profile,
        settings: action.payload.settings,
        sales: action.payload.sales,
        categories: action.payload.categories,
        goals: action.payload.goals,
      }

    case 'hydrate-failed':
      return { ...state, status: 'error', hydrateError: action.error }

    case 'persist-failed':
      return { ...state, persistError: action.error }

    case 'persist-error-cleared':
      return { ...state, persistError: null }

    case 'sale-added':
      return { ...state, sales: [action.sale, ...state.sales] }

    case 'sale-swapped':
      return {
        ...state,
        sales: state.sales.map((s) => (s.id === action.fromId ? action.sale : s)),
      }

    case 'sale-replaced':
      return { ...state, sales: upsertById(state.sales, action.sale) }

    case 'sale-removed':
      return { ...state, sales: state.sales.filter((s) => s.id !== action.id) }

    case 'sale-restored':
      return state.sales.some((s) => s.id === action.sale.id)
        ? state
        : { ...state, sales: [action.sale, ...state.sales] }

    case 'sales-set':
      return { ...state, sales: action.sales }

    case 'category-upserted':
      return { ...state, categories: upsertById(state.categories, action.category) }

    case 'category-swapped':
      return {
        ...state,
        categories: state.categories.map((c) => (c.id === action.fromId ? action.category : c)),
      }

    case 'categories-set':
      return { ...state, categories: action.categories }

    case 'goals-set':
      return { ...state, goals: action.goals }

    case 'settings-set':
      return { ...state, settings: action.settings }

    case 'profile-set':
      return { ...state, profile: action.profile }

    default:
      return state
  }
}

/* -------------------------------------------------------------------- actions */

/** Fields a screen may edit on an existing sale (§17). Mirrors repo.SaleUpdate. */
export type SalePatch = SaleUpdate

export interface SetGoalOptions {
  /**
   * First day the new amount applies. Defaults to today, so historical
   * attainment keeps the goal it was measured against (§32, §69). Pass an
   * earlier date only when the agent explicitly asks to restate the past.
   */
  effectiveFrom?: IsoDate
  /**
   * false turns the goal off from `effectiveFrom` onward without deleting any
   * history — the repository writes a disabled row rather than removing rows.
   */
  enabled?: boolean
}

export interface OnboardingPayload {
  profile: { displayName: string; initials?: string | null }
  /** Any subset of daily / monthly / annual. Omitted types get no goal row. */
  goals: Partial<Record<GoalType, { amount: Cents; enabled?: boolean }>>
  /** Merged over current settings. onboardingCompletedAt is set for you. */
  settings: Partial<Settings>
  /**
   * Extra starter categories. The database already seeds the §34 defaults
   * (Primary Sale / Upsell / Other) on first open, so this is usually empty.
   */
  categories?: NewCategoryInput[]
}

export interface StoreActions {
  /** Records a sale. Returns the optimistic Sale synchronously (§14). */
  addSale: (input: NewSaleInput) => Sale
  /** Edits a sale. Commission re-freezes from the sale's OWN rate, not today's. */
  updateSale: (id: string, patch: SalePatch) => Sale | null
  /** Marks a sale cancelled. It stays in the ledger; it stops counting (§18). */
  cancelSale: (id: string, reason?: string | null, cancelledOn?: IsoDate) => Sale | null
  /** Reverses a cancellation — the Undo target for the §70 toast. */
  uncancelSale: (id: string) => Sale | null
  /** Hard delete. Returns the removed Sale, ready to hand to restoreSale. */
  deleteSale: (id: string) => Sale | null
  /** Puts a deleted sale back exactly as it was, id and timestamps included. */
  restoreSale: (sale: Sale) => void
  /** Versioned goal write. Delegates the interval maths to the repository. */
  setGoal: (type: GoalType, amount: Cents, options?: SetGoalOptions) => void
  /** Shallow merge into Settings. Also applies theme and reduced-motion. */
  saveSettings: (patch: Partial<Settings>) => Settings
  addCategory: (input: NewCategoryInput) => Category
  updateCategory: (id: string, patch: CategoryUpdate) => Category | null
  /** Writes profile, goals, categories and settings in one go (§8). */
  completeOnboarding: (payload: OnboardingPayload) => void
  /** Edits display name / initials outside onboarding. */
  saveProfile: (patch: Partial<AgentProfile>) => AgentProfile
  /**
   * Re-reads everything from storage. Call this after any operation that
   * rewrites the database behind the store's back — Restore Backup (§40) and
   * Reset App (§44) are the only two.
   */
  reload: () => Promise<void>
  /** Dismisses the current persistError banner. */
  dismissPersistError: () => void
}

/* ---------------------------------------------------------------- derived data
   Memoised so a re-render never rebuilds an index. Deliberately cheap: these
   are lookups, not metrics. Arithmetic belongs in src/core/calc. */

export interface StoreDerived {
  /** All sales, newest first (date desc, then time desc). */
  sortedSales: Sale[]
  /** Non-cancelled sales only, newest first. */
  activeSales: Sale[]
  /** 'YYYY-MM-DD' -> that day's sales, newest first. */
  salesByDate: Map<IsoDate, Sale[]>
  /** 'YYYY-MM' -> that month's sales, newest first. */
  salesByMonth: Map<string, Sale[]>
  salesById: Map<string, Sale>
  categoriesById: Map<string, Category>
  /** Active categories in sortOrder — what the Add Sale chips should show. */
  activeCategories: Category[]
  /** Goal rows per type, oldest first. */
  goalsByType: Record<GoalType, Goal[]>
  /**
   * The goal row in force on a date, honouring effectiveFrom/effectiveTo and
   * `enabled` (§69). null when there is no goal of that type for that date.
   */
  goalFor: (type: GoalType, date: IsoDate) => Goal | null
  /** True until onboarding has been completed (§7). */
  needsOnboarding: boolean
}

/* ------------------------------------------------------------- add-sale intent
   The FAB lives in the shell; the Add Sale sheet belongs to the Home team.
   This is the handshake between them. */

export interface AddSaleIntent {
  isOpen: boolean
  /** Seed values, e.g. opening Add Sale on a past date from the ledger. */
  prefill: Partial<NewSaleInput> | null
  open: (prefill?: Partial<NewSaleInput>) => void
  close: () => void
}

/* ------------------------------------------------------------------- contexts */

const StateContext = createContext<StoreState | null>(null)
const DerivedContext = createContext<StoreDerived | null>(null)
const ActionsContext = createContext<StoreActions | null>(null)
const AddSaleContext = createContext<AddSaleIntent | null>(null)

/* ------------------------------------------------------------------- provider */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const { setTheme } = useTheme()

  // Latest state, readable synchronously inside actions without listing it as
  // a dependency — otherwise the actions object would be rebuilt on every
  // keystroke and re-render every consumer.
  const stateRef = useRef(state)
  stateRef.current = state

  const [addSaleOpen, setAddSaleOpen] = useState(false)
  const [addSalePrefill, setAddSalePrefill] = useState<Partial<NewSaleInput> | null>(null)

  /* -------------------------------------------------------------- hydrate */

  const hydrate = useCallback(async () => {
    try {
      const data = await repo.loadAll()
      dispatch({ type: 'hydrated', payload: data })
    } catch (err) {
      dispatch({ type: 'hydrate-failed', error: toError(err) })
    }
  }, [])

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  /* --------------------------------------------------- write-through helper
     Fire and forget: the UI has already moved on (§64). `rollback` restores
     the pre-mutation rows if the write is rejected, so what is on screen and
     what is on disk never disagree. */

  const persist = useCallback(
    (action: string, work: () => Promise<void>, rollback?: () => void) => {
      void work().catch((err: unknown) => {
        rollback?.()
        dispatch({
          type: 'persist-failed',
          error: { message: userMessage(err), action, at: Date.now() },
        })
        console.error(`[SalesTrack] ${action} could not be saved`, err)
      })
    },
    [],
  )

  /* ---------------------------------------------------- theme + motion sync */

  useEffect(() => {
    if (state.status !== 'ready') return
    setTheme(state.settings.theme)
    const root = document.documentElement
    if (state.settings.reducedMotion === true) root.setAttribute('data-reduced-motion', 'true')
    else root.removeAttribute('data-reduced-motion')
  }, [state.status, state.settings.theme, state.settings.reducedMotion, setTheme])

  /* -------------------------------------------------------------- actions */

  const actions = useMemo<StoreActions>(() => {
    const snapshot = () => stateRef.current
    const findSale = (id: string) => snapshot().sales.find((s) => s.id === id) ?? null

    /** Optimistically replace a sale, then let the repository have the last word. */
    const optimisticSale = (
      previous: Sale,
      next: Sale,
      actionName: string,
      write: () => Promise<Sale>,
    ): Sale => {
      dispatch({ type: 'sale-replaced', sale: next })
      persist(
        actionName,
        async () => {
          const saved = await write()
          dispatch({ type: 'sale-replaced', sale: saved })
        },
        () => dispatch({ type: 'sale-replaced', sale: previous }),
      )
      return next
    }

    return {
      addSale(input) {
        const { settings, categories } = snapshot()
        const category = input.categoryId
          ? (categories.find((c) => c.id === input.categoryId) ?? null)
          : null

        // Same resolution the repository will apply, using the repository's own
        // functions — so the optimistic figure matches the frozen one exactly.
        const rate = repo.resolveCommissionRate(input.commissionRate, category, settings)
        const pendingId = tempId('sale')
        const now = Date.now()

        const optimistic: Sale = {
          id: pendingId,
          amount: input.amount,
          date: input.date,
          time: input.time,
          categoryId: input.categoryId ?? null,
          commissionRate: rate,
          commissionAmount: repo.computeCommission(input.amount, rate),
          note: input.note ?? null,
          status: 'active',
          createdAt: now,
          modifiedAt: now,
          cancellation: null,
          adjustedAmount: null,
        }

        dispatch({ type: 'sale-added', sale: optimistic })
        persist(
          'addSale',
          async () => {
            const saved = await repo.createSale(input, settings, categories)
            dispatch({ type: 'sale-swapped', fromId: pendingId, sale: saved })
          },
          () => dispatch({ type: 'sale-removed', id: pendingId }),
        )

        return optimistic
      },

      updateSale(id, patch) {
        const current = findSale(id)
        if (!current) return null

        const amount = patch.amount ?? current.amount
        const commissionRate = patch.commissionRate ?? current.commissionRate
        const next: Sale = {
          ...current,
          ...patch,
          amount,
          commissionRate,
          commissionAmount: repo.computeCommission(amount, commissionRate),
          modifiedAt: Date.now(),
        }
        return optimisticSale(current, next, 'updateSale', () => repo.updateSale(id, patch))
      },

      cancelSale(id, reason = null, cancelledOn = todayIso()) {
        const current = findSale(id)
        if (!current) return null
        const next: Sale = {
          ...current,
          status: 'cancelled',
          cancellation: { cancelledOn, reason: reason?.trim() || null, cancelledAt: Date.now() },
          modifiedAt: Date.now(),
        }
        return optimisticSale(current, next, 'cancelSale', () =>
          repo.cancelSale(id, reason, cancelledOn),
        )
      },

      uncancelSale(id) {
        const current = findSale(id)
        if (!current) return null
        const next: Sale = {
          ...current,
          // Mirrors the repository: a revised sale returns to 'adjusted'.
          status: current.adjustedAmount !== null ? 'adjusted' : 'active',
          cancellation: null,
          modifiedAt: Date.now(),
        }
        return optimisticSale(current, next, 'uncancelSale', () => repo.uncancelSale(id))
      },

      deleteSale(id) {
        const current = findSale(id)
        if (!current) return null
        dispatch({ type: 'sale-removed', id })
        persist(
          'deleteSale',
          async () => {
            await repo.deleteSale(id)
          },
          () => dispatch({ type: 'sale-restored', sale: current }),
        )
        return current
      },

      restoreSale(sale) {
        dispatch({ type: 'sale-restored', sale })
        persist(
          'restoreSale',
          async () => {
            await repo.restoreSale(sale)
          },
          () => dispatch({ type: 'sale-removed', id: sale.id }),
        )
      },

      setGoal(type, amount, options = {}) {
        const from = options.effectiveFrom ?? todayIso()
        const enabled = options.enabled ?? true
        const previous = snapshot().goals

        // Mirror `repository.writeGoalRow` exactly. This used to approximate it
        // and the approximation showed: closing the old row AT `from` (rather
        // than the day before) left two rows both claiming to be in force, so
        // Settings > Goals rendered two "(in force now)" entries until the
        // write landed. `effectiveTo` is inclusive (types.ts).
        const closeAt = addDays(from, -1)
        const optimistic: Goal[] = [
          ...previous.flatMap((g) => {
            if (g.type !== type) return [g]
            // Same start date is a correction of that row, not a new interval.
            if (g.effectiveFrom === from) return []
            // Starts later: superseded, matching the repository.
            if (g.effectiveFrom > from) return []
            if (g.effectiveTo === null || g.effectiveTo >= from) {
              return [{ ...g, effectiveTo: closeAt }]
            }
            return [g]
          }),
          {
            id: tempId('goal'),
            type,
            amount,
            effectiveFrom: from,
            effectiveTo: null,
            enabled,
            createdAt: Date.now(),
          },
        ]
        dispatch({ type: 'goals-set', goals: optimistic })

        persist(
          'setGoal',
          async () => {
            if (enabled) await repo.setGoal(type, amount, from)
            else await repo.disableGoal(type, from)
            dispatch({ type: 'goals-set', goals: await repo.listGoals() })
          },
          () => dispatch({ type: 'goals-set', goals: previous }),
        )
      },

      saveSettings(patch) {
        const previous = snapshot().settings
        const next: Settings = { ...previous, ...patch }
        dispatch({ type: 'settings-set', settings: next })
        persist(
          'saveSettings',
          async () => {
            await repo.saveSettings(next)
          },
          () => dispatch({ type: 'settings-set', settings: previous }),
        )
        return next
      },

      addCategory(input) {
        const pendingId = tempId('cat')
        const cats = snapshot().categories
        const optimistic: Category = {
          id: pendingId,
          name: input.name.trim(),
          icon: input.icon ?? null,
          commissionRate: input.commissionRate ?? null,
          active: true,
          sortOrder: input.sortOrder ?? cats.length,
          createdAt: Date.now(),
        }
        dispatch({ type: 'category-upserted', category: optimistic })
        persist(
          'addCategory',
          async () => {
            const saved = await repo.createCategory(input)
            dispatch({ type: 'category-swapped', fromId: pendingId, category: saved })
          },
          () =>
            dispatch({
              type: 'categories-set',
              categories: snapshot().categories.filter((c) => c.id !== pendingId),
            }),
        )
        return optimistic
      },

      updateCategory(id, patch) {
        const current = snapshot().categories.find((c) => c.id === id)
        if (!current) return null
        const next: Category = { ...current, ...patch, id: current.id }
        dispatch({ type: 'category-upserted', category: next })
        persist(
          'updateCategory',
          async () => {
            const saved = await repo.updateCategory(id, patch)
            dispatch({ type: 'category-upserted', category: saved })
          },
          () => dispatch({ type: 'category-upserted', category: current }),
        )
        return next
      },

      completeOnboarding(payload) {
        const now = Date.now()
        const current = snapshot()

        const profile: AgentProfile = {
          displayName: payload.profile.displayName.trim(),
          initials: payload.profile.initials ?? null,
          createdAt: current.profile?.createdAt ?? now,
        }
        const settings: Settings = {
          ...current.settings,
          ...payload.settings,
          onboardingCompletedAt: now,
        }

        // Optimistic: the agent lands on Home immediately (§7, under 2 minutes).
        dispatch({ type: 'profile-set', profile })
        dispatch({ type: 'settings-set', settings })

        const startedOn = todayIso()
        persist(
          'completeOnboarding',
          async () => {
            await repo.saveProfile(profile)
            await repo.saveSettings(settings)
            for (const [type, goal] of Object.entries(payload.goals)) {
              if (!goal) continue
              if (goal.enabled === false) await repo.disableGoal(type as GoalType, startedOn)
              else await repo.setGoal(type as GoalType, goal.amount, startedOn)
            }
            for (const category of payload.categories ?? []) {
              await repo.createCategory(category)
            }
            // Single reconcile rather than N dispatches. Onboarding runs once.
            dispatch({ type: 'hydrated', payload: await repo.loadAll() })
          },
          () => {
            dispatch({ type: 'settings-set', settings: current.settings })
            if (current.profile) dispatch({ type: 'profile-set', profile: current.profile })
          },
        )
      },

      saveProfile(patch) {
        const previous = snapshot().profile
        const profile: AgentProfile = {
          displayName: patch.displayName ?? previous?.displayName ?? '',
          initials: patch.initials !== undefined ? patch.initials : (previous?.initials ?? null),
          createdAt: previous?.createdAt ?? Date.now(),
        }
        dispatch({ type: 'profile-set', profile })
        persist(
          'saveProfile',
          async () => {
            await repo.saveProfile(profile)
          },
          () => {
            if (previous) dispatch({ type: 'profile-set', profile: previous })
          },
        )
        return profile
      },

      reload: hydrate,

      dismissPersistError() {
        dispatch({ type: 'persist-error-cleared' })
      },
    }
  }, [persist, hydrate])

  /* -------------------------------------------------------------- derived */

  const sortedSales = useMemo(
    () =>
      [...state.sales].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        if (a.time !== b.time) return a.time < b.time ? 1 : -1
        return b.createdAt - a.createdAt
      }),
    [state.sales],
  )

  const activeSales = useMemo(
    () => sortedSales.filter((s) => s.status !== 'cancelled'),
    [sortedSales],
  )

  const salesById = useMemo(() => {
    const map = new Map<string, Sale>()
    for (const s of state.sales) map.set(s.id, s)
    return map
  }, [state.sales])

  const salesByDate = useMemo(() => {
    const map = new Map<IsoDate, Sale[]>()
    for (const s of sortedSales) {
      const bucket = map.get(s.date)
      if (bucket) bucket.push(s)
      else map.set(s.date, [s])
    }
    return map
  }, [sortedSales])

  const salesByMonth = useMemo(() => {
    const map = new Map<string, Sale[]>()
    for (const s of sortedSales) {
      const key = s.date.slice(0, 7)
      const bucket = map.get(key)
      if (bucket) bucket.push(s)
      else map.set(key, [s])
    }
    return map
  }, [sortedSales])

  const categoriesById = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of state.categories) map.set(c.id, c)
    return map
  }, [state.categories])

  const activeCategories = useMemo(
    () => state.categories.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [state.categories],
  )

  const goalsByType = useMemo(() => {
    const grouped: Record<GoalType, Goal[]> = { daily: [], monthly: [], annual: [] }
    for (const g of state.goals) grouped[g.type]?.push(g)
    for (const key of Object.keys(grouped) as GoalType[]) {
      grouped[key].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
    }
    return grouped
  }, [state.goals])

  // Delegates rather than re-deriving. This used to walk the rows itself,
  // ordering on `effectiveFrom` alone with no createdAt/id tiebreak, so on a
  // same-day correction it could disagree with the shared resolver and put a
  // different goal in Settings' "in force now" hint than the timeline beside
  // it showed. Four copies of this logic existed; this is the last one.
  const goalFor = useCallback(
    (type: GoalType, date: IsoDate): Goal | null => calcGoalFor(type, date, state.goals),
    [state.goals],
  )

  const derived = useMemo<StoreDerived>(
    () => ({
      sortedSales,
      activeSales,
      salesByDate,
      salesByMonth,
      salesById,
      categoriesById,
      activeCategories,
      goalsByType,
      goalFor,
      needsOnboarding: state.settings.onboardingCompletedAt == null,
    }),
    [
      sortedSales,
      activeSales,
      salesByDate,
      salesByMonth,
      salesById,
      categoriesById,
      activeCategories,
      goalsByType,
      goalFor,
      state.settings.onboardingCompletedAt,
    ],
  )

  /* ------------------------------------------------------- add-sale intent */

  const addSaleIntent = useMemo<AddSaleIntent>(
    () => ({
      isOpen: addSaleOpen,
      prefill: addSalePrefill,
      open: (prefill) => {
        setAddSalePrefill(prefill ?? null)
        setAddSaleOpen(true)
      },
      close: () => {
        setAddSaleOpen(false)
        setAddSalePrefill(null)
      },
    }),
    [addSaleOpen, addSalePrefill],
  )

  return (
    <StateContext.Provider value={state}>
      <DerivedContext.Provider value={derived}>
        <ActionsContext.Provider value={actions}>
          <AddSaleContext.Provider value={addSaleIntent}>{children}</AddSaleContext.Provider>
        </ActionsContext.Provider>
      </DerivedContext.Provider>
    </StateContext.Provider>
  )
}

/* --------------------------------------------------------------------- hooks */

function useRequired<T>(ctx: React.Context<T | null>, name: string): T {
  const value = useContext(ctx)
  if (value === null) throw new Error(`${name} must be used inside <StoreProvider>`)
  return value
}

export interface Store extends StoreState, StoreActions {
  derived: StoreDerived
}

/**
 * useStore — everything at once: state, derived indexes, and actions.
 *
 * Convenient, but it re-renders on ANY state change. Prefer the narrow hooks
 * below inside list rows and anything that renders often.
 */
export function useStore(): Store {
  const state = useRequired(StateContext, 'useStore')
  const derived = useRequired(DerivedContext, 'useStore')
  const actions = useRequired(ActionsContext, 'useStore')
  return useMemo(() => ({ ...state, ...actions, derived }), [state, actions, derived])
}

/** Sale rows plus the memoised indexes. */
export function useSales(): {
  sales: Sale[]
  sortedSales: Sale[]
  activeSales: Sale[]
  salesByDate: Map<IsoDate, Sale[]>
  salesByMonth: Map<string, Sale[]>
  salesById: Map<string, Sale>
} {
  const state = useRequired(StateContext, 'useSales')
  const d = useRequired(DerivedContext, 'useSales')
  return useMemo(
    () => ({
      sales: state.sales,
      sortedSales: d.sortedSales,
      activeSales: d.activeSales,
      salesByDate: d.salesByDate,
      salesByMonth: d.salesByMonth,
      salesById: d.salesById,
    }),
    [state.sales, d],
  )
}

/** The Settings row. Never null — falls back to defaults before hydrate. */
export function useSettings(): Settings {
  return useRequired(StateContext, 'useSettings').settings
}

export function useCategories(): {
  categories: Category[]
  activeCategories: Category[]
  categoriesById: Map<string, Category>
} {
  const state = useRequired(StateContext, 'useCategories')
  const d = useRequired(DerivedContext, 'useCategories')
  return useMemo(
    () => ({
      categories: state.categories,
      activeCategories: d.activeCategories,
      categoriesById: d.categoriesById,
    }),
    [state.categories, d],
  )
}

export function useGoals(): {
  goals: Goal[]
  goalsByType: Record<GoalType, Goal[]>
  /** The goal in force on a date, honouring goal history (§69). */
  goalFor: (type: GoalType, date: IsoDate) => Goal | null
} {
  const state = useRequired(StateContext, 'useGoals')
  const d = useRequired(DerivedContext, 'useGoals')
  return useMemo(
    () => ({ goals: state.goals, goalsByType: d.goalsByType, goalFor: d.goalFor }),
    [state.goals, d],
  )
}

/** The agent's name and initials. null only before onboarding writes it. */
export function useProfile(): AgentProfile | null {
  return useRequired(StateContext, 'useProfile').profile
}

/**
 * Actions only. Referentially stable for the life of the app, so a component
 * that merely mutates never re-renders when state changes.
 */
export function useActions(): StoreActions {
  return useRequired(ActionsContext, 'useActions')
}

/** Hydration status plus any storage error worth surfacing. */
export function useStoreStatus(): {
  status: StoreStatus
  hydrateError: Error | null
  persistError: PersistError | null
  needsOnboarding: boolean
} {
  const state = useRequired(StateContext, 'useStoreStatus')
  const d = useRequired(DerivedContext, 'useStoreStatus')
  return {
    status: state.status,
    hydrateError: state.hydrateError,
    persistError: state.persistError,
    needsOnboarding: d.needsOnboarding,
  }
}

/**
 * useAddSale — where the shell's + Sale button and the Home team's Add Sale
 * sheet meet. The FAB calls open(); the sheet renders while isOpen is true.
 */
export function useAddSale(): AddSaleIntent {
  return useRequired(AddSaleContext, 'useAddSale')
}

export default StoreProvider

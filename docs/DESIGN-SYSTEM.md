# SalesTrack — Design System, Shell & Store

The reference for the four screen teams. Read this instead of reading
`src/styles`, `src/components` and `src/app`.

Owner: Design System. If you need something here that does not exist, ask —
do not add it to `src/components` yourself.

---

## 0. The five rules

1. **Import primitives from `@/components`.** Never hand-roll a bordered
   `<div>`. Never write a hex colour, a radius, a shadow or a font size.
2. **Import state from `@/app/store`.** Never call `src/data/*` from a screen —
   everything is already in memory (§64). The only exceptions are backup,
   restore, CSV and reset, which the Settings team calls directly and follows
   with `reload()`.
3. **Numbers come in formatted.** Primitives never format money. Use
   `src/core/format.ts` at the render boundary and pass strings in.
4. **Never write Sync / Cloud / Account / Server / Connected** in any string a
   user can see (§62). Say *Saved*, *Stored locally*, *On this device*,
   *Backup created*.
5. **Colour is never the only signal** (§63). Every status colour is paired
   with a word or a glyph.

---

## 1. Tokens — `src/styles/tokens.css`

Three theme layers, in this order: bare `:root` (light), then
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`, then
`:root[data-theme="dark"]`. No colour is defined only inside a media query, so
the explicit toggle wins in both directions.

### Surfaces

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ground` | `#f7f8fa` | `#0b1220` | App background. Painted on `body`. |
| `--surface` | `#ffffff` | `#141c2b` | Cards, nav, rail. |
| `--surface-elevated` | `#ffffff` | `#1b2434` | Sheets, dialogs, toasts. |
| `--surface-sunken` | `#eef0f4` | `#0a101c` | Wells, progress tracks, chips, keypad keys. |
| `--surface-hover` / `--surface-active` | — | — | Row and button washes. |
| `--scrim` | 45% ink | 62% ink | Behind modals. |

### Text

`--text-primary` · `--text-secondary` · `--text-tertiary` (labels, meta —
never body copy) · `--text-inverse` · `--text-disabled`.

### Accent & status

Each family has a solid, a weak background, a readable text tint, and an
on-colour foreground.

| Family | Solid | Weak bg | Text | On |
| --- | --- | --- | --- | --- |
| Accent | `--accent` | `--accent-weak` | `--accent-text` | `--accent-on` |
| Positive | `--positive` | `--positive-weak` | `--positive-text` | `--positive-on` |
| Warning | `--warning` | `--warning-weak` | `--warning-text` | `--warning-on` |
| Negative | `--negative` | `--negative-weak` | `--negative-text` | `--negative-on` |
| Neutral | `--neutral` | `--neutral-weak` | `--neutral-text` | — |

Use `--*-text` for coloured text on a light surface (the solid colours are
tuned for fills and do not always clear AA as text).

Map `PaceStatus` like this: `ahead` and `goal-reached` → positive, `on-track` →
accent or neutral, `behind` → warning (spec §52 asks for *restrained* warning
styling, not alarm), `no-goal` → neutral. Reserve negative for cancellations
and destructive actions.

### Lines, focus, progress, charts

`--border` · `--border-strong` · `--divider` · `--focus-ring`
`--progress-track` · `--progress-fill` · `--progress-overflow`
`--chart-grid` · `--chart-axis` · `--chart-series-1…5`

### Type scale

Prose ramp — deliberately restrained so the numeric ramp is the only thing
that ever looks big:

`--text-2xs` 11 · `--text-xs` 12 · `--text-sm` 13 · `--text-base` 15 ·
`--text-md` 16 · `--text-lg` 18 · `--text-xl` 20 · `--text-2xl` 24

**Numeric display ramp** (§50) — for figures only, never prose:

| Token | Size | Use |
| --- | --- | --- |
| `--num-xs` | 17px | figure inside a list row |
| `--num-sm` | 22px | StatTile in a dense strip |
| `--num-md` | 28px | supporting metric |
| `--num-lg` | 36px | Month / Year card headline |
| `--num-xl` | 46px | screen-level headline |
| `--num-hero` | `clamp(3.5rem, 14vw, 4rem)` → 56–64px | the `$742` on Home (§10) |

Always pair a figure with the `.num` utility class (or `StatTile`, which does
it for you): `font-variant-numeric: tabular-nums lining-nums` so digits do not
jitter as a total ticks up. `body` sets `tabular-nums` globally as a floor.

Weights: `--weight-regular|medium|semibold|bold`. Tracking:
`--tracking-tight` (large numerals) · `--tracking-wide` (uppercase eyebrows).

### Spacing, radii, shadows

Spacing on a 4px grid: `--space-1` 4 … `--space-20` 80.
Radii: `--radius-xs` 6 · `sm` 8 · `md` 12 · **`lg` 16 (the card default)** ·
`xl` 20 · `2xl` 28 (sheet top) · `full`.
Shadows: `--shadow-xs|sm|md|lg|fab`. Cards get `--shadow-sm` and nothing more.

### Layout

`--nav-height` 58 · `--nav-total` (nav + safe area) · `--fab-size` 56 ·
`--rail-width` 232 · `--content-max` 1120 · `--content-pad` · `--tap-min` 44 ·
`--safe-top|bottom|left|right` (from `env(safe-area-inset-*)`).

Z-ladder — never invent a value: `--z-sticky` 20 · `--z-nav` 40 · `--z-fab` 45 ·
`--z-scrim` 55 · `--z-sheet` 60 · `--z-toast` 70 · `--z-celebration` 80.

### Motion

`--dur-instant|fast|base|slow` and `--ease-standard|out|in`.
`prefers-reduced-motion` zeroes the duration tokens globally, so **any**
transition written against them is neutralised automatically — including yours.
`Settings.reducedMotion === true` sets `data-reduced-motion` on `<html>` and
does the same thing regardless of the OS preference.

### Global utility classes — `src/styles/global.css`

| Class | Purpose |
| --- | --- |
| `.num` | tabular figures + tight tracking + bold. Use on every number. |
| `.eyebrow` | 11px uppercase tertiary label above a metric. |
| `.sr-only` | screen-reader-only text. Use it liberally. |
| `.pad-for-nav` | bottom padding clearing the nav **and** the FAB. Any scrolling screen region needs this on mobile. |
| `.safe-bottom` | `env(safe-area-inset-bottom)` padding. |
| `.focus-inset` | focus ring drawn inside, for edge-flush controls. |
| `.skip-link` | shell already renders one. |

---

## 2. Primitives — `src/components`

```ts
import { Card, StatTile, StatGrid, ProgressBar, Button, Chip, ChipRow,
         SegmentedControl, Sheet, EmptyState, NumericKeypad, KeypadDisplay,
         ConfirmDialog, Celebration, useOneShot, Skeleton, PageHeader,
         useToast } from '@/components'
```

### `<Card>`

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | |
| `padding` | `'none'\|'sm'\|'md'\|'lg'` | `'md'` | |
| `tone` | `'default'\|'flat'\|'sunken'\|'accent'\|'positive'\|'warning'\|'negative'` | `'default'` | `accent` at most **once** per screen |
| `title` | `ReactNode` | — | renders an `<h2>` header row |
| `headerAction` | `ReactNode` | — | trailing control in the header |
| `onClick` | handler | — | renders as `<button>` with press affordance |
| `ariaLabel` | `string` | — | required when the visible label is a bare number |
| `as` | `'section'\|'div'\|'article'\|'li'` | `'section'` | ignored when `onClick` is set |

### `<Button>`

| Prop | Type | Default |
| --- | --- | --- |
| `variant` | `'primary'\|'secondary'\|'ghost'\|'danger'\|'danger-quiet'` | `'secondary'` |
| `size` | `'sm'\|'md'\|'lg'` | `'md'` |
| `block` `loading` | `boolean` | `false` |
| `icon` `iconRight` | `ReactNode` | — |
| `ariaLabel` | `string` | required for icon-only |
| `ref` | `Ref<HTMLButtonElement>` | React 19 plain prop |

`md` is 44px and `lg` is 54px. **`sm` is 34px** — only safe inside a row that
is already 44px tall. `loading` should almost never appear: local writes are
instant (§64).

### `<ProgressBar>` — the §51 primitive

| Prop | Type | Notes |
| --- | --- | --- |
| `value` | `number` | **Fraction, not percent.** `0.785` → 78.5%. Uncapped. Exactly `PaceResult.progress`. |
| `label` | `string` | **required** accessible name |
| `caption` | `ReactNode` | left text, e.g. `"$7,850 / $10,000"` |
| `valueLabel` / `hideValueLabel` | | override or hide the auto `"78.5%"` |
| `footnote` | `ReactNode` | line under the bar |
| `markerAt` | `number` | "expected by today" tick, same scale as `value` |
| `tone` | `'accent'\|'positive'\|'warning'\|'negative'\|'neutral'` | |
| `size` | `'sm'\|'md'\|'lg'` | 6 / 10 / 14px |

**Beyond 100% it rescales instead of clipping.** At `value = 1.24` the goal
line slides to `1/1.24 ≈ 81%` of the width and the final 19% paints in
`--progress-overflow` with a hairline at the goal. The bar is therefore always
full once the goal is met, and the overshoot is legible. `aria-valuetext`
says "124% of goal — goal exceeded".

### `<StatTile>` / `<StatGrid>`

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `ReactNode` | small uppercase eyebrow |
| `value` | `ReactNode` | **already formatted** |
| `sub` | `ReactNode` | supporting line |
| `subTone` | `'default'\|'positive'\|'warning'\|'negative'` | colours only the sub-line |
| `size` | `'xs'\|'sm'\|'md'\|'lg'\|'xl'\|'hero'` | `hero` is **reserved for the Today figure** |
| `tone` | `'default'\|'accent'\|'positive'\|'warning'\|'negative'\|'muted'` | colours the figure |
| `align` | `'start'\|'center'` | |
| `ariaLabel` | `string` | supply when the visual text is elliptical (`"+$242 / Above Goal"`) |

`<StatGrid columns={2|3|4}>` is the §11 Month / Year / Commission strip.

### `<Chip>` / `<ChipRow>`

`selected` `onClick` `icon` `disabled` `size` `ariaLabel`. Selection is
signalled three ways: `aria-pressed`, a check glyph, and a tint.
`<ChipRow wrap label>` scrolls horizontally by default.

### `<SegmentedControl<T extends string>>`

| Prop | Type | Notes |
| --- | --- | --- |
| `options` | `{ value, label, ariaLabel?, disabled? }[]` | |
| `value` / `onChange` | `T` / `(v: T) => void` | |
| `role` | `'radio'` (default) \| `'tabs'` | use `tabs` + `controlsId` for the Day/Month/Year/All ledger tabs |
| `label` | `string` | **required** group name |
| `size` `auto` | | |

Roving Arrow/Home/End keys select as they move. 44px overall height.

### `<Sheet>` — bottom sheet on mobile, centred modal ≥900px

`open` `onClose` `title` `description` `children` `footer` `fullHeight` `wide`
`flushBody` `hideClose` `disableDrag` `dismissible` `initialFocus`.

Handles portal, scrim, `aria-modal` + labelled title, focus trap, Escape,
reference-counted body scroll lock, and drag-to-dismiss on touch. Put the
primary action (`Record Sale`) in `footer`.

Also exported: `useFocusTrap(ref, open, onClose, opts)`, `getFocusable(root)`,
`lockBodyScroll()`, `unlockBodyScroll()` — reuse these rather than writing a
second trap.

### `<ToastProvider>` / `useToast()` — the §70 Undo channel

```ts
const { toast, success, error, undoable, dismiss } = useToast()

success('$389 added', { detail: 'Aeration · 2:07 PM', key: 'sale-added' })

// Spec §70 in one line — this is the pattern for cancel and delete:
const removed = deleteSale(id)
if (removed) undoable('Sale deleted', () => restoreSale(removed))

cancelSale(id)
undoable('Sale cancelled', () => uncancelSale(id))
```

`ToastOptions`: `message` `detail` `tone` (`neutral|success|warning|error`)
`duration` (default 4000, **7000 when an action is present**, 0 = manual)
`action` (`{ label, onClick, closeOnClick? }`) `key` (replaces instead of
stacking). Max 3 visible. The viewport already sits above the nav and FAB.

### `<EmptyState>` — §57

`title` `body` `action` `icon` (pass `null` for none) `compact`.
Copy rules: never apologise, never say "no data", never mention loading or
connection. Say what will appear and how to make it appear.

### `<NumericKeypad>` / `<KeypadDisplay>` — §14 / §55

```tsx
const [cents, setCents] = useState(0)
<KeypadDisplay formatted={formatCentsPlain(cents)} empty={cents === 0} />
<NumericKeypad value={cents} onChange={setCents} />
```

Cash-register entry — typing `3 8 9 0 0` yields `38900`. **Emits integer cents**,
so the money invariant holds end to end. 60px keys. `captureKeyboard` (default
true) binds physical digits and Backspace but never steals keys from a real
input. Also exported: `appendDigit`, `removeDigit`, `MAX_AMOUNT_CENTS`.

### `<ConfirmDialog>` — §13 and §44

`open` `onCancel` `onConfirm` `title` `body` `confirmLabel` `cancelLabel`
`tone` (`'danger'|'primary'`) `requireTypedWord` `typedWordLabel`.

Pass `requireTypedWord="DELETE"` for Reset App (§44); the confirm button stays
disabled until the input matches exactly. Role is `alertdialog`, focus starts
on Cancel. Use a ConfirmDialog for irreversible actions and an Undo toast for
reversible ones — not both.

### `<Celebration>` + `useOneShot()` — §53

```tsx
const fire = useOneShot(pace.status === 'goal-reached', `daily:${today}`)
<Celebration active={fire} announcement="Daily goal reached" />
```

`useOneShot(condition, key)` is the guard that stops this firing on every
render. A goal, once reached, stays reached all day — `active={progress >= 1}`
alone would re-fire on every keystroke. Keys are remembered for the session.

Celebrate **only** for: daily goal, monthly goal, annual goal, new personal
record. **Never for an ordinary sale** — the spec is explicit. The burst is
`pointer-events: none`, ~1.1s, and collapses to a single still pulse under
reduced motion. `forceReducedMotion` should be passed `Settings.reducedMotion`.

### `<Skeleton>` / `<SkeletonText>`

`width` `height` `variant` (`text|block|circle|card`). For the first hydrate
only. If you reach for this on a screen, you probably want the real data —
§64 forbids artificial loading states for local reads.

### `<PageHeader>`

`title` `subtitle` `showStoredLocally` `statusText` `onBack` `backLabel`
`actions`. The status line reads **"Saved on this device"** and must never be
changed to anything mentioning connection or sync.

---

## 3. The store — `src/app/store.tsx`

### Boot

`StoreProvider` calls `repository.loadAll()` **once**. Until it resolves,
`status === 'loading'` and `App.tsx` shows `LoadingScreen`. After that,
everything is in memory. There is no other async read in the application.

### Mutation model

Every action updates memory **synchronously** and writes through afterwards.
Actions do not return promises you must await before drawing (§64).

When a write resolves, the store **reconciles** its optimistic row with the
repository's authoritative record — so the frozen commission rate, the
generated id and the versioned goal rows are always the stored truth.

When a write **fails**, the optimistic row is **rolled back** and
`persistError` is set to `{ message, action, at }`, where `message` is a
user-safe sentence from `StorageError.userMessage`. A sale that looks saved
but is not is the worst outcome in this product.

### Hooks

```ts
useStore(): StoreState & StoreActions & { derived: StoreDerived }
```
Everything at once. Re-renders on **any** state change — fine for a screen
root, wrong inside a list row.

```ts
useSales(): {
  sales:        Sale[]                    // raw, unsorted
  sortedSales:  Sale[]                    // newest first (date desc, time desc)
  activeSales:  Sale[]                    // status !== 'cancelled'
  salesByDate:  Map<IsoDate, Sale[]>      // 'YYYY-MM-DD' -> day, newest first
  salesByMonth: Map<string, Sale[]>       // 'YYYY-MM'    -> month
  salesById:    Map<string, Sale>
}

useSettings(): Settings                   // never null

useCategories(): {
  categories:      Category[]
  activeCategories: Category[]            // active, in sortOrder — the chip list
  categoriesById:  Map<string, Category>
}

useGoals(): {
  goals:      Goal[]
  goalsByType: Record<GoalType, Goal[]>   // oldest first
  goalFor:    (type: GoalType, date: IsoDate) => Goal | null
}

useProfile(): AgentProfile | null         // null only before onboarding

useActions(): StoreActions                // referentially STABLE — never re-renders

useStoreStatus(): {
  status: 'loading' | 'ready' | 'error'
  hydrateError: Error | null
  persistError: PersistError | null
  needsOnboarding: boolean
}

useAddSale(): {                           // the FAB <-> Add Sale sheet handshake
  isOpen: boolean
  prefill: Partial<NewSaleInput> | null
  open: (prefill?: Partial<NewSaleInput>) => void
  close: () => void
}
```

Every index is memoised, so a re-render never rebuilds them. `goalFor` respects
`effectiveFrom` / `effectiveTo` and walks newest-first; a **disabled** row means
"no goal from here" and returns `null` rather than falling through to an older
enabled row.

### Actions — `useActions()`

```ts
addSale(input: NewSaleInput): Sale
```
Returns the optimistic `Sale` synchronously. The commission rate is resolved
with the repository's own `resolveCommissionRate` (explicit → category rule →
global default), so the optimistic figure equals the frozen one. The id is a
temporary `sale:pending:…` string, swapped for the real one when the write
lands — do not persist it anywhere.

```ts
updateSale(id, patch: SaleUpdate): Sale | null
cancelSale(id, reason?: string | null, cancelledOn?: IsoDate): Sale | null
uncancelSale(id): Sale | null
deleteSale(id): Sale | null      // returns the removed row -> hand to restoreSale
restoreSale(sale: Sale): void
```
`SaleUpdate` = `{ amount?, date?, time?, categoryId?, commissionRate?, note?,
adjustedAmount?, status?: 'active'|'adjusted' }`. Cancellation is **not**
reachable through `updateSale` — use `cancelSale`. Commission re-freezes from
the sale's **own** rate, never today's default (§69).

```ts
setGoal(type: GoalType, amount: Cents, options?: {
  effectiveFrom?: IsoDate   // default today — never rewrites history (§32, §69)
  enabled?: boolean         // false routes to disableGoal, preserving history
}): void
```
Interval maths lives in the repository. The store applies a light optimistic
edit and re-reads `listGoals()` immediately after, so what you see is what is
stored. Goal edits are a Settings action, not a hot path.

```ts
saveSettings(patch: Partial<Settings>): Settings
```
Shallow merge. **Also applies theme and reduced-motion** — calling
`saveSettings({ theme })` is sufficient; you do not also need `setTheme`.

```ts
addCategory(input: NewCategoryInput): Category
updateCategory(id, patch: CategoryUpdate): Category | null
saveProfile(patch: Partial<AgentProfile>): AgentProfile
completeOnboarding(payload: OnboardingPayload): void
reload(): Promise<void>
dismissPersistError(): void
```

`OnboardingPayload`:
```ts
{
  profile: { displayName: string; initials?: string | null }
  goals: Partial<Record<GoalType, { amount: Cents; enabled?: boolean }>>
  settings: Partial<Settings>            // onboardingCompletedAt is set for you
  categories?: NewCategoryInput[]        // the §34 defaults are already seeded
}
```
Calling it flips `needsOnboarding` to false and the shell routes to Home.

**`reload()` is required after Restore Backup (§40) and Reset App (§44)** —
those rewrite the database underneath the store.

---

## 4. Router — `src/app/router.tsx`

Dependency-free hash router. No react-router.

```
#/                    Home
#/sales               Ledger        (?tab=day|month|year|all&date=…)
#/insights            Insights      (?range=7d|30d|90d|year|all)
#/settings            Settings
#/settings/goals | commission | categories | schedule | appearance | data | about
#/onboarding          gate — the shell routes here automatically
```

```ts
useRouter(): { path, query, segments, tab, navigate, back, setQuery }
useNavigate(): (path, { replace?, query? }) => void
useSubRoute('/settings'): string | null      // '/settings/goals' -> 'goals'
<Link to="/sales" query={{ tab: 'month' }}>…</Link>
```

`Link` renders a real `href`, so middle-click and open-in-new-tab work.
`ROUTES` exports the canonical path constants — use them, not literals.

**Settings team:** `App.tsx` routes every `/settings/*` path to your
`SettingsScreen`. Read the sub-route yourself with `useSubRoute('/settings')`.

---

## 5. Shell — `src/app/AppShell.tsx`

Same information architecture at both sizes (§59: not a different app).

**Mobile (< 900px)** — scrolling content, a fixed four-item bottom bar
(Home / Sales / Insights / Settings), and a floating **+ Sale** pill on the
right, above the bar, inside thumb reach (§6, §58). The bar carries
`env(safe-area-inset-bottom)`; the toast viewport already clears both.

**Desktop (≥ 900px)** — the bottom bar and floating button both disappear.
The same four destinations become a **left rail** (232px, sticky, full height)
with the brand mark at the top and *Stored on this device* at the bottom.
**+ Sale becomes the rail's primary button** at the top of the list, so it is
still the most prominent control on the screen, just where a pointer expects
it. Content is centred and capped at `--content-max` (1120px).

Screens **opt into** extra columns rather than rearranging themselves. Three
layout helpers are available anywhere:

| Class | Behaviour |
| --- | --- |
| `.shell-stack` | vertical rhythm between cards |
| `.shell-split` | 1 column, becomes `2fr / 1fr` at ≥900px — metrics beside the sales list (§59) |
| `.shell-metrics` | `auto-fit, minmax(220px, 1fr)` — 1 up on a phone, 2–4 up as width allows |

Add `.pad-for-nav` to any scrolling region so the last row is not trapped
under the nav or the FAB. The shell already applies it to the routed content.

### Add Sale sheet — Home team, action required

The FAB must work from every tab, so the sheet has to be mounted **once,
globally**, not inside `HomeScreen`.

1. Export it as the default export of `src/screens/home/AddSaleSheet.tsx`.
2. Have it read `useAddSale()` for `isOpen` / `prefill` / `close`.
3. Tell the Design System owner; `App.tsx` becomes
   `<AppShell overlays={<AddSaleSheet />}>` — one import, one line.

Until then the FAB flips the intent and nothing renders. A marked TODO block
sits at the top of `src/App.tsx`.

---

## 6. Theme — `src/app/ThemeProvider.tsx`

```ts
useTheme(): { theme: ThemePreference, resolved: 'light'|'dark', setTheme }
```

`data-theme` on `<html>`; `"system"` removes the attribute. **`Settings.theme`
in IndexedDB is the source of truth**; `localStorage['salestrack.theme']` is a
mirror read by `applyStoredThemeEarly()` in `main.tsx` purely so a dark-mode
launch does not flash white. The provider also keeps the `theme-color` meta
tags in step, so the mobile status bar matches.

**Settings > Appearance: just call `saveSettings({ theme })`.** The store
forwards to `setTheme` for you.

---

## 7. Provider order — `src/App.tsx`

```
ErrorBoundary          catches everything below, including a failed hydrate
└── ThemeProvider      owns <html data-theme>; outside the store, which calls
    └── ToastProvider  useTheme() to apply Settings.theme after hydrate
        └── StoreProvider
            └── RouterProvider   inside the store, so guards read onboarding
                └── AppRoot -> LoadingScreen | OnboardingFlow | AppShell+Routes
```

`LoadingScreen` (§61) is a centred mark, "SalesTrack", and "Your personal sales
ledger". No spinner, no percentage, and no connection language — the app has
nothing to connect to. `ErrorBoundary` leads with "Your sales are safe.
Everything is still stored on this device." and never implies data loss.

---

## 8. Icons

`public/favicon.svg` and `public/icons/icon-{192,512}.png` plus
`icon-maskable-512.png`. The mark is a blue rounded square carrying three
ascending bars — a ledger going up — legible at 16px because it is three
shapes and one colour.

Regenerate the PNGs from the same geometry with:

```
node scripts/generate-icons.mjs
```

The script rasterises with 4× supersampling and encodes PNG using only Node's
built-in `zlib` — no `sharp`, no headless browser. The maskable variant insets
the artwork to the 80% safe zone and bleeds the background edge to edge.

---

## 9. Accessibility floor (§63)

- 44px minimum targets. `Button size="sm"` (34px) only inside an
  already-44px row.
- Never colour alone. Every status colour is paired with a word or glyph, and
  every primitive here already does it — keep it up in your own markup.
- Visible focus on everything (`:focus-visible`, handled globally).
- Screen-reader labels: `ProgressBar.label` and `SegmentedControl.label` are
  **required** props for this reason. Use `ariaLabel` on `StatTile` whenever
  the visible text is elliptical.
- Charts need a text summary (`.sr-only`) — Insights team, this is on you.
- Reduced motion is honoured automatically if you animate with the duration
  tokens.

## 10. Copy that is not allowed (§62)

**Never:** Sync, Synced, Syncing, Cloud, Account, Server, Connected,
Connecting, Offline, Upload, Download to cloud, Sign in, Log out.

**Instead:** Saved · Saved on this device · Stored locally · On this device ·
Backup created · Restore backup · Delete all local data.

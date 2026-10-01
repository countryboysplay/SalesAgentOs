# SalesTrack — Build Contract

Read this before writing a line. It exists so several specialists can build in
parallel without colliding.

## Product
A local-only, offline-first PWA that answers one question instantly:
**"Where do I stand?"** Spec: `Inside Sales Tracker PWA - Product and UX Design Specification.md`
(78 sections). The spec is authoritative on behaviour and copy. This file is
authoritative on structure.

## Hard constraints (spec §2, §36, §62)
- No backend, no auth, no network calls, no analytics, no CDN fonts at runtime.
  **Single exception:** `src/team/fetchBoard.ts` reads the two team dashboard
  feeds for Team → Boards (GET only, no cookies, never sends sales data). No
  other module may touch the network.
- All data in IndexedDB on the device. App shell cached by a service worker.
- Never use the words: Sync, Cloud, Account, Server, Connected. Use: Saved,
  Stored locally, On this device, Backup created.

## Stack
Vite 7 + React 19 + TypeScript (strict) + `idb` + `vite-plugin-pwa` + Vitest.
No UI framework, no CSS-in-JS, no chart library — charts are hand-rolled SVG so
they stay readable at 360px and add zero bundle weight.

## Non-negotiable invariants
1. **Money is integer cents.** Never a float, never a formatted string in state.
   Formatting happens only at the render boundary via `src/core/format.ts`.
2. **Commission rates are basis points.** 5% = 500.
3. **Dates are `YYYY-MM-DD` local strings.** Never `Date` in state, never UTC
   ISO. Use `src/core/date.ts` helpers. A sale entered at 11pm must belong to
   that local day.
4. **Historical integrity (§69).** A sale freezes its commission rate at write
   time. Goals are versioned rows with `effectiveFrom`/`effectiveTo` — changing
   a goal never rewrites past attainment.
5. **Gross vs net (§18).** Cancelled sales stay in history and stay visible in
   the ledger, but stop contributing to net. Dashboards show **net** by default.
6. **Screens never compute metrics.** All arithmetic lives in `src/core/calc`.
   If a screen needs a number that doesn't exist, add a selector there.
7. **No loading spinners for local reads (§64).** Everything is in memory after
   first hydrate.

## Module map — one owner per directory

| Path | Contents | Owner |
| --- | --- | --- |
| `src/core/types.ts` | **FROZEN** shared contract. Do not edit. | shared |
| `src/core/date.ts` | Local-date helpers, workday math, month/year ranges. | Calc |
| `src/core/money.ts` | Cents arithmetic, commission, rounding. | Calc |
| `src/core/format.ts` | Currency/percent/date display formatting. | Calc |
| `src/core/calc/*` | Totals, pace, records, streaks, categories, trends. | Calc |
| `src/data/db.ts` | IndexedDB schema, open, migrations. | Data |
| `src/data/repository.ts` | CRUD for sales, categories, goals, settings. | Data |
| `src/data/backup.ts` | Backup export, restore, summary, reset. | Data |
| `src/data/csv.ts` | CSV export. | Data |
| `src/styles/*` | Design tokens, themes, global CSS. | Design System |
| `src/components/*` | Reusable primitives (Card, Button, Sheet, …). | Design System |
| `src/app/*` | Store/provider, router, shell, bottom nav. | Design System |
| `src/screens/onboarding/*` | First launch + setup (§7–8). | Home team |
| `src/screens/home/*` | Home dashboard + Add Sale sheet (§9–14). | Home team |
| `src/screens/sales/*` | Ledger: day/month/year/all, calendar (§19–25). | Sales team |
| `src/screens/insights/*` | Insights + charts (§26–31). | Insights team |
| `src/screens/settings/*` | Goals, commission, categories, data (§32–45). | Settings team |
| `src/kb/*` | Playbook content model, Markdown subset parser, offline search. | Team |
| `src/kb/packs/*` | Training material as Markdown + one manifest per pack. | Team |
| `src/screens/team/*` | Team tab: Playbook and Boards screens. | Team |
| `src/team/*` | Board feeds: parse/validate (dollars → cents), fetch, on-device cache. | Team |

## Team boards
- Feeds: Employee Sales Scoreboard (`?format=json` on its existing public web
  app) and a separate key-protected GSR feed project. Paste-in code and steps
  are in `docs/apps-script/`.
- Board settings (agent name, GSR link/key) and the last good copy of each
  board live in a **separate** IndexedDB database, `salesagentos-team`. It
  is not part of the sales schema or backups. *Delete everything* clears it too.
- Cards refresh only while visible (scoreboard 30 s, GSR 60 s), keep the last
  board on failure and always say what time the numbers are from.

## Playbook (knowledge base)
Training packs ship **inside the bundle** (`?raw` Markdown imports), so they
are precached by the service worker and read offline from first install. They
are read-only, never stored in IndexedDB and never part of a backup.

- Keep the owner's wording. Structural edits only (headings, list form).
- A pack is cut into articles at `##`; each `###` is a topic that call stages
  and search results link to. A manifest can split a `##` into one article per
  `###`, mark articles `coaching`, tag articles/topics with call stages and
  feature one article.
- To add a pack: drop `src/kb/packs/<name>.md`, write a manifest next to it,
  add it to `MANIFESTS` in `src/kb/library.ts`. `library.test.ts` fails if a
  stage tag points at a heading that does not exist.
- The app is served publicly (GitHub Pages), so **anything in a pack is
  public**. Confidential pricing does not belong in a pack.

**Do not create files outside your assigned directory.** If you need a shared
primitive that doesn't exist, note it in your final report rather than adding it
to someone else's folder.

## State access
A single store in `src/app/store.tsx` hydrates everything from IndexedDB once at
boot, holds it in memory, and writes through to IndexedDB on mutation. Screens
read via hooks (`useSales()`, `useSettings()`, `useCategories()`, `useGoals()`)
and mutate via actions (`addSale()`, `updateSale()`, `cancelSale()`, …).
Optimistic in-memory update first, persist after — writes must never block the UI.

## Accessibility floor (§63)
44px minimum touch targets. Never colour alone — pair every status colour with
text or an icon. Charts carry a text summary for screen readers. Respect
`prefers-reduced-motion`. Visible focus rings everywhere.

## Verification
`npm run typecheck` and `npm test` must pass. The calculation engine carries
Vitest coverage for every acceptance test in spec §77.

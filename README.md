# SalesAgentOS

A personal sales-performance tracker for inside sales agents. It answers three
questions the moment you open it: how am I doing today, this month, this year.

It is deliberately **not a CRM**. No leads, no customers, no territories, no
team. It is one salesperson's private ledger and scoreboard.

## Everything stays on your device

No backend. No account. No cloud. No sync. Your sales history lives in your
browser's local storage on the device where you installed the app, and it never
leaves. That is a feature, and it is also why **backups matter** — see
Settings → Data.

## Running it

```bash
npm install
npm run dev        # development server
npm run build      # production build
npm run preview    # serve the production build (needed to test the PWA)
npm test           # calculation + persistence test suites
npm run typecheck
```

Install it as an app from the browser's install prompt. Once installed it opens
standalone, works with the network off, and keeps your data locally.

## Layout

```
src/core/      calculations — money, dates, pace, records. No I/O, fully tested.
src/data/      IndexedDB persistence, backup/restore, CSV export.
src/app/       store, router, shell, theme.
src/components/ design-system primitives.
src/screens/   Home, Sales, Insights, Settings, Onboarding.
docs/          ARCHITECTURE.md (build contract), DESIGN-SYSTEM.md.
```

The full product specification is
`Inside Sales Tracker PWA - Product and UX Design Specification.md`.
`docs/ARCHITECTURE.md` holds the invariants any contributor needs first —
notably that money is stored in integer cents, dates are local `YYYY-MM-DD`
strings, and history is never rewritten when goals or commission rates change.

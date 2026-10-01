# Handoff: Team tab + Call Knowledge Base for SalesAgentOS

Put this file at `docs/HANDOFF-team-and-knowledge-base.md` in the SalesAgentOs repo,
then start Claude Code in the repo with:

> Read docs/HANDOFF-team-and-knowledge-base.md, README.md, docs/ARCHITECTURE.md and
> docs/DESIGN-SYSTEM.md. Then tell me what you need from me to start.

---

## Goal (from the owner, a sales manager)

SalesAgentOS (React + Vite + TypeScript PWA, IndexedDB, local-only today) is used by
inside sales agents on their phones. The owner wants agents to **hone their skills**,
not just track numbers. Two additions, in this order:

1. **Call Knowledge Base** — how to structure a sales call. Content comes from the
   owner's own training materials (scripts, objection sheets, program/pricing docs),
   which the owner will supply. Keep their wording. Organize by call stage
   (opener → discovery → program pitch → objection handling → close → recap), searchable,
   readable offline. Not yet built; structure should follow the materials once provided.
2. **Team tab** with native cards for two existing Google Apps Script dashboards the
   owner built.

Rejected for now: dial counters, call timers, callback lists, AI role-play (may come later;
would need a Cloudflare Worker + AI API).

## Decisions already made

- Dashboards come in as **native cards**, not iframes or links. Each Apps Script gets a
  small JSON mode (e.g. `doGet(e)` returns `ContentService` JSON when `e.parameter.format == 'json'`)
  without changing the existing HTML page. The app fetches when online, caches the last
  payload in IndexedDB, and shows "last updated" when offline.
- Agents may see **everything** on the GSR dashboard (same view as managers).
- This deliberately relaxes the README's "no network" principle for the Team tab only.
  Personal sales data stays local and is never sent anywhere. Update the spec/README to say so.

## The two dashboards

1. **GSR Live Performance Dashboard**
   `https://script.google.com/a/macros/weedmanusa.com/s/AKfycbzuaVvbrvxb2yelGbZm5DBZpUoTw2ilPJPeHBLhm6vmEF3uoJJvQpG8tzJMQ6HaP1KE/exec`
   - Restricted to weedmanusa.com Google accounts.
   - Shows: YTD revenue vs year-end budget, total / FAO / PGC attainment %, remaining gap,
     "Executive Focus" (branch with largest gap), branch leaderboard
     (branch, YTD actual, YE budget, attainment, remaining, status), FAO/PGC heatmap,
     historical trend. Branch keys seen: EVAN/HEND, SOIL, OWEN, BOWL, PAD.
   - Data: actuals from synced CRM CSV exports (5-min sync), budgets from the GSR Google
     Sheet; page auto-refreshes every 30 s.
   - **Auth problem:** a PWA can't send the user's Google session to a domain-restricted
     script (and iOS blocks it in iframes too). The JSON endpoint will need its own
     deployment set to "Anyone", ideally protected with a shared key in the query string
     stored in Settings, or a Cloudflare Worker proxy. Confirm the approach with the owner.

2. **Employee Sales Scoreboard**
   `https://script.google.com/macros/s/AKfycbxWPOViBoRyY04CQSk0M5SQ2SS1pQd0PjOBOijq4wQSOUFUQY4M8vrRlBVEOYC5nnAh/exec`
   - Public ("anyone with link"). Fed by WEMMS (employee portal).
   - Shows: Team Yes $, Total Yes, Active Agents; table of rank, agent, Yes count, Yes $
     (ranked by today's Yes dollars); auto-refresh every 15 s; celebration animations.
   - Team tab should highlight the agent's own row (agent picks their name once in Settings).

The Apps Script source for both is **not in GitHub**. Ask the owner to paste each
`Code.gs` (or the whole project), then write the JSON add-on for them to paste in and
redeploy. Only read their code; the owner deploys.

## Repo constraints to respect (from the codebase)

- `src/core/types.ts` is the frozen domain contract — add new types as a deliberate,
  coordinated change.
- IndexedDB `DB_VERSION = 1` in `src/data/db.ts`; new stores need a version bump plus an
  upgrade step that never modifies shipped migration entries.
- `src/data/backup.ts` backup/restore must include any new user-owned stores
  (cached dashboard payloads and shipped KB content can be excluded; agent bookmarks/notes
  should be included).
- Router is a hand-rolled hash router (`src/app/router.tsx`); bottom nav is 4 tabs
  (Home, Sales, Insights, Settings). Decide with the owner whether Team and the Knowledge
  Base become tabs or live under one new "Team"/"Learn" tab.
- Money is integer cents; dates are local `YYYY-MM-DD`.
- Use the existing components in `src/components/` and tokens in `src/styles/tokens.css`.
- Tests exist for calc and persistence; add tests for the new fetch/cache and KB search.

## Open items (waiting on the owner)

1. Training materials for the knowledge base (any format).
2. Apps Script code for both dashboards.
3. GSR auth approach (shared-key "Anyone" deployment vs Worker proxy).
4. Navigation placement for Team and the Knowledge Base.

## Suggested build order

1. KB content model + viewer + offline search, filled from the owner's materials.
2. Scoreboard JSON add-on + Team tab scoreboard card (public, simplest).
3. GSR JSON add-on + auth + GSR cards.
4. Spec/README updates.

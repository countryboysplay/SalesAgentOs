# Apps Script changes for the Team tab boards

The Team tab shows the Employee Sales Scoreboard and the GSR Live Performance
Dashboard as cards built into the app. It reads both as JSON. Nothing here
changes what the existing dashboard pages look like.

These files are for **you to paste in and deploy**. The app never deploys or
edits Apps Script itself.

## 1. Employee Sales Scoreboard (about 2 minutes)

The scoreboard is already deployed with access set to *Anyone*, so it only
needs a JSON mode.

1. Open the scoreboard's Apps Script project and open `Code.gs`.
2. Replace the existing `doGet()` function with the contents of
   [`scoreboard-doGet.gs`](scoreboard-doGet.gs) (`doGet` plus `scoreboardJson_`).
3. **Deploy → Manage deployments**, select the current web-app deployment,
   click the pencil icon, set **Version: New version**, then click **Deploy**.
   The URL stays the same.
4. Check it: open `<scoreboard URL>?format=json` in a browser. You should see
   JSON with an `agents` list. The plain URL should still show the page.

The JSON contains only what the page already shows: rank, agent name, Yes
count and Yes $, plus totals. The spreadsheet link is removed.

## 2. GSR Live Performance Dashboard (about 5 minutes)

The GSR dashboard is limited to weedmanusa.com accounts, and an installed app
can't send a Google login along with its request. So instead of changing that
project, create a **separate, JSON-only** project. It reads the same
spreadsheet and needs a key on every request. The existing dashboard and its
deployment stay exactly as they are.

1. Go to <https://script.google.com>, click **New project**, and name it
   `GSR app feed`.
2. Replace the starter code with [`gsr-app-feed.gs`](gsr-app-feed.gs).
3. Set `SPREADSHEET_ID` to the same value as `CONFIG.SPREADSHEET_ID` in the
   GSR dashboard's `Code.gs`.
4. In the function picker, choose `rotateSalesAgentOsKey`, click **Run**, and
   approve the permissions prompt. Open **Execution log** and copy the key.
5. Click **Deploy → New deployment → Web app**. Set **Execute as: Me** and
   **Who has access: Anyone**, then click **Deploy** and copy the web app URL.
6. Check it: `<feed URL>?key=<key>` should return JSON with `"ok": true`.
   Without the key it should return `{"ok":false,"error":"unauthorized"}`.
7. Give agents the feed URL and the key. Each agent enters them once in the
   app under **Team → Boards → Set up**.

**What the key protects, and what it doesn't.** Without the key, the feed
returns nothing. Anyone who has both the URL and the key can read the GSR
numbers (branch revenue, budgets and attainment), the same view agents and
managers see on the dashboard. To cut off old copies, run
`rotateSalesAgentOsKey` again and give agents the new key. No redeploy is
needed.

If you later change how the dashboard reads budgets or history, copy that
change into the feed project too. The copied functions are marked in the file.

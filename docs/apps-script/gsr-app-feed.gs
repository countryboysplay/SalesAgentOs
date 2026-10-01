/**
 * SalesAgentOS — GSR app feed (standalone Apps Script project).
 *
 * A separate, JSON-only web app the SalesAgentOS Team tab reads. It opens the
 * same GSR spreadsheet read-only and returns the same numbers the GSR Live
 * Performance Dashboard shows. The existing dashboard project is not changed.
 *
 * Every request must carry ?key=<key>. The key lives in this project's Script
 * Properties, never in code; run rotateSalesAgentOsKey() to create or change it.
 *
 * The functions below the line are copied unchanged from the dashboard's
 * Code.gs (read-only parts only: no doPost, no publish secret). If you change
 * how the dashboard reads budgets or history, copy the change here too.
 */

const CONFIG = {
  // Same value as CONFIG.SPREADSHEET_ID in the GSR dashboard's Code.gs.
  SPREADSHEET_ID: 'PASTE_GSR_SPREADSHEET_ID_HERE',
  BUDGET_SHEET: 'GSR_Budget',
  LIVE_SHEET: '_WEMMS_LIVE',
  HISTORY_SHEET: 'GSR_HISTORY',
  HISTORY_MAX_POINTS: 120,
  DISPLAY_ORDER: ['BOWL', 'EVAN/HEND', 'OWEN', 'PAD', 'SOIL']
};

const APP_KEY_PROPERTY = 'SALESAGENTOS_READ_KEY';

function doGet(e) {
  const key = String((e && e.parameter && e.parameter.key) || '');
  const expected = PropertiesService.getScriptProperties().getProperty(APP_KEY_PROPERTY);

  if (!expected || !safeEqual_(key, expected)) {
    return jsonResponse_({ ok: false, error: 'unauthorized' });
  }

  try {
    const live = readWemmsLiveCurrent_();
    return jsonResponse_({
      ok: true,
      generatedAt: live.receivedAt,
      requestedAt: new Date().toISOString(),
      sourceGeneratedAt: live.sourceGeneratedAt,
      current: live.current,
      history: getHistorySeries_()
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'GSR data is not available right now.' });
  }
}

/**
 * Run once from the editor (and again whenever you want to cut off old
 * copies). Logs the new key; give it to agents to enter in the app under
 * Team > Boards > Set up.
 */
function rotateSalesAgentOsKey() {
  const key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40);
  PropertiesService.getScriptProperties().setProperty(APP_KEY_PROPERTY, key);
  Logger.log('New SalesAgentOS key: ' + key);
  return key;
}

/** Constant-time comparison, so response timing does not leak the key. */
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- Copied unchanged from the GSR dashboard Code.gs ---------- */

function readWemmsLiveCurrent_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.LIVE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error('No WEMMS live data has been published yet.');
  }

  const budgetMap = readBudgetMap_();
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  const branches = [];
  let receivedAt = null;
  let sourceGeneratedAt = '';
  let source = 'WEMMS rds_FastGSR';

  rows.forEach(row => {
    const branchName = String(row[0] || '').trim();
    if (!branchName) return;
    const budget = budgetMap[branchName];
    if (!budget) throw new Error(`${branchName}: budget row not found in ${CONFIG.BUDGET_SHEET}.`);

    const totalActual = number_(row[1]);
    const faoActual = number_(row[2]);
    const pgcActual = number_(row[3]);

    branches.push({
      branch: branchName,
      totalActual: round2_(totalActual),
      totalBudget: budget.totalBudget,
      totalAttainment: ratio_(totalActual, budget.totalBudget),
      totalRemaining: Math.max(budget.totalBudget - totalActual, 0),
      faoActual: round2_(faoActual),
      faoBudget: budget.faoBudget,
      faoAttainment: ratio_(faoActual, budget.faoBudget),
      faoRemaining: Math.max(budget.faoBudget - faoActual, 0),
      pgcActual: round2_(pgcActual),
      pgcBudget: budget.pgcBudget,
      pgcAttainment: ratio_(pgcActual, budget.pgcBudget),
      pgcRemaining: Math.max(budget.pgcBudget - pgcActual, 0),
      pgcOver: Math.max(pgcActual - budget.pgcBudget, 0),
      sourceFile: String(row[7] || 'WEMMS rds_FastGSR'),
      sourceModifiedAt: String(row[4] || '')
    });

    sourceGeneratedAt = sourceGeneratedAt || String(row[4] || '');
    source = String(row[7] || source);
    if (!receivedAt && row[5]) {
      receivedAt = row[5] instanceof Date ? row[5] : new Date(row[5]);
    }
  });

  const missing = CONFIG.DISPLAY_ORDER.filter(name => !branches.some(b => b.branch === name));
  if (missing.length) throw new Error(`Stored WEMMS live data is missing: ${missing.join(', ')}`);

  branches.sort((a, b) => CONFIG.DISPLAY_ORDER.indexOf(a.branch) - CONFIG.DISPLAY_ORDER.indexOf(b.branch));

  return {
    current: buildCurrent_(branches),
    receivedAt: receivedAt && !isNaN(receivedAt.getTime()) ? receivedAt.toISOString() : new Date().toISOString(),
    sourceGeneratedAt,
    source
  };
}

function readBudgetMap_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.BUDGET_SHEET);
  if (!sheet) throw new Error(`Budget sheet "${CONFIG.BUDGET_SHEET}" not found.`);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('GSR budget sheet has no branch rows.');

  // A:J = Branch, Total Actual, Total Budget, %, FAO Actual, FAO Budget,
  // %, PGC Actual, PGC Budget, %.
  const rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const map = {};

  rows.forEach(row => {
    const branch = String(row[0] || '').trim();
    if (!branch) return;

    const totalBudget = number_(row[2]);
    const faoBudget = number_(row[5]);
    const pgcBudget = number_(row[8]);

    if (!totalBudget || !faoBudget || !pgcBudget) {
      throw new Error(`${branch}: one or more required YE budgets are blank/zero.`);
    }

    map[branch] = { totalBudget, faoBudget, pgcBudget };
  });

  return map;
}

function buildCurrent_(branches) {
  const totals = branches.reduce((a, b) => {
    a.totalActual += number_(b.totalActual);
    a.totalBudget += number_(b.totalBudget);
    a.faoActual += number_(b.faoActual);
    a.faoBudget += number_(b.faoBudget);
    a.pgcActual += number_(b.pgcActual);
    a.pgcBudget += number_(b.pgcBudget);
    return a;
  }, {
    totalActual: 0, totalBudget: 0,
    faoActual: 0, faoBudget: 0,
    pgcActual: 0, pgcBudget: 0
  });

  totals.totalAttainment = ratio_(totals.totalActual, totals.totalBudget);
  totals.faoAttainment = ratio_(totals.faoActual, totals.faoBudget);
  totals.pgcAttainment = ratio_(totals.pgcActual, totals.pgcBudget);
  totals.totalRemaining = Math.max(totals.totalBudget - totals.totalActual, 0);
  totals.faoRemaining = Math.max(totals.faoBudget - totals.faoActual, 0);
  totals.pgcRemaining = Math.max(totals.pgcBudget - totals.pgcActual, 0);
  totals.pgcOver = Math.max(totals.pgcActual - totals.pgcBudget, 0);

  return { branches, totals };
}

function ensureHistorySheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.HISTORY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.HISTORY_SHEET);
    const headers = [[
      'Timestamp', 'Branch',
      'Total Actual', 'Total Budget', 'Total Attainment',
      'FAO Actual', 'FAO Budget', 'FAO Attainment',
      'PGC Actual', 'PGC Budget', 'PGC Attainment',
      'Source File', 'Source Modified At',
      'Snapshot Hash'
    ]];

    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm:ss AM/PM');
    sheet.getRange('C:D').setNumberFormat('$#,##0.00');
    sheet.getRange('F:G').setNumberFormat('$#,##0.00');
    sheet.getRange('I:J').setNumberFormat('$#,##0.00');
    sheet.getRange('E:E').setNumberFormat('0.0%');
    sheet.getRange('H:H').setNumberFormat('0.0%');
    sheet.getRange('K:K').setNumberFormat('0.0%');
    sheet.hideSheet();
  }
  return sheet;
}

function getHistorySeries_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ensureHistorySheet_(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rowsToRead = Math.min(lastRow - 1, CONFIG.HISTORY_MAX_POINTS * 10);
  const startRow = Math.max(2, lastRow - rowsToRead + 1);
  const values = sheet.getRange(startRow, 1, rowsToRead, 11).getValues();

  const grouped = {};
  values.forEach(row => {
    const ts = row[0] instanceof Date ? row[0].getTime() : new Date(row[0]).getTime();
    if (!ts || !row[1]) return;

    if (!grouped[ts]) {
      grouped[ts] = {
        timestamp: new Date(ts).toISOString(),
        totalActual: 0, totalBudget: 0,
        faoActual: 0, faoBudget: 0,
        pgcActual: 0, pgcBudget: 0
      };
    }

    grouped[ts].totalActual += number_(row[2]);
    grouped[ts].totalBudget += number_(row[3]);
    grouped[ts].faoActual += number_(row[5]);
    grouped[ts].faoBudget += number_(row[6]);
    grouped[ts].pgcActual += number_(row[8]);
    grouped[ts].pgcBudget += number_(row[9]);
  });

  return Object.values(grouped)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-CONFIG.HISTORY_MAX_POINTS)
    .map(x => ({
      timestamp: x.timestamp,
      totalAttainment: ratio_(x.totalActual, x.totalBudget),
      faoAttainment: ratio_(x.faoActual, x.faoBudget),
      pgcAttainment: ratio_(x.pgcActual, x.pgcBudget),
      totalActual: x.totalActual
    }));
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function number_(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ratio_(a, b) {
  a = number_(a);
  b = number_(b);
  return b ? a / b : 0;
}

function round2_(n) {
  return Math.round(number_(n) * 100) / 100;
}

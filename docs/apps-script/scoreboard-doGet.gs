/**
 * SalesAgentOS — Employee Sales Scoreboard JSON mode.
 *
 * Replace the existing doGet() in the scoreboard's Code.gs with this one and
 * add scoreboardJson_() below it. Nothing else changes: without
 * ?format=json the page renders exactly as before.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.format === 'json') {
    return scoreboardJson_();
  }

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Employee Sales Scoreboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * The same data the page already loads through getDashboardData(), minus the
 * spreadsheet link. Read by the SalesAgentOS Team tab.
 */
function scoreboardJson_() {
  try {
    const data = getDashboardData();
    delete data.spreadsheetUrl;
    return jsonResponse_(data);
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'Scoreboard is not available right now.' });
  }
}

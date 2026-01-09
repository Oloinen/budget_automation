// Centralized E2E config loader
function loadConfig(overrides = {}) {
  const cfg = {
    scriptId: process.env.APPS_SCRIPT_ID,
    templateSheetId: process.env.TEST_TEMPLATE_SHEET_ID,
    testFolderId: process.env.TEST_FOLDER_ID,
    testReceiptsFolderId: process.env.TEST_RECEIPTS_FOLDER_ID,
    keyJson: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON,
    testBudgetYear: process.env.TEST_BUDGET_YEAR ? Number(process.env.TEST_BUDGET_YEAR) : undefined,
    testSpreadsheetId: process.env.TEST_SPREADSHEET_ID,
    skipCleanup: process.env.SKIP_CLEANUP === 'true',
    productionBudgetDataSheetId: process.env.PRODUCTION_BUDGET_DATA_SHEET_ID,
    allowProductionCopy: process.env.ALLOW_PRODUCTION_COPY === 'true',
    mockGoogleApi: process.env.MOCK_GOOGLEAPI === '1',
    productionScriptIds: (process.env.PRODUCTION_SCRIPT_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };

  return Object.assign({}, cfg, overrides);
}

module.exports = { loadConfig };

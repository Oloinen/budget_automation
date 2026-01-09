#!/usr/bin/env node
// Node helper to invoke the Apps Script E2E runner via the Apps Script Execution API.
// Requires environment variables: APPS_SCRIPT_ID, TEST_SPREADSHEET_ID, and GOOGLE_SERVICE_ACCOUNT_KEY_JSON

const { google } = require("./googleapis-wrapper");

async function main() {
  const { loadConfig } = require("./load_config");
  const argSpreadsheet = process.argv[2];
  const argBudgetYear = process.argv[3];
  const cfg = loadConfig({ testSpreadsheetId: argSpreadsheet, testBudgetYear: argBudgetYear });
  const scriptId = cfg.scriptId;
  const testSpreadsheetId = cfg.testSpreadsheetId;
  const testBudgetYear = cfg.testBudgetYear;
  const keyJson = cfg.keyJson;

  if (!scriptId || !testSpreadsheetId || !keyJson) {
    console.error(
      "Missing required env vars. Set APPS_SCRIPT_ID, TEST_SPREADSHEET_ID, and GOOGLE_SERVICE_ACCOUNT_KEY_JSON",
    );
    process.exit(2);
  }
  const { validateE2EEnv } = require("./validate_config");
  validateE2EEnv(["APPS_SCRIPT_ID", "TEST_SPREADSHEET_ID", "GOOGLE_SERVICE_ACCOUNT_KEY_JSON"]);

  const credentials = JSON.parse(keyJson);
  const { setupClients } = require("./helpers");
  const cfg = loadConfig({ testSpreadsheetId });
  cfg.keyJson = keyJson; // ensure credentials available to helper
  const clients = await setupClients(cfg);
  const script = clients.script;

  const request = {
    scriptId,
    requestBody: {
      function: "runCreditCardImportE2E",
      parameters: testBudgetYear ? [testSpreadsheetId, testBudgetYear] : [testSpreadsheetId],
      devMode: true,
    },
  };

  try {
    const res = await script.scripts.run(request);
    console.log(JSON.stringify(res.data, null, 2));
    if (res.data.error) process.exit(1);
  } catch (e) {
    console.error("Execution error", e);
    process.exit(1);
  }
}

main();

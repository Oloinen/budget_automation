#!/usr/bin/env node
// Node helper to invoke the Apps Script E2E runner via the Apps Script Execution API.
// Requires environment variables: APPS_SCRIPT_ID, TEST_SPREADSHEET_ID, and GOOGLE_SERVICE_ACCOUNT_KEY_JSON

const { google } = require("googleapis");

async function main() {
  const scriptId = process.env.APPS_SCRIPT_ID;
  const testSpreadsheetId = process.argv[2] || process.env.TEST_SPREADSHEET_ID;
  const testBudgetYear = process.argv[3] || process.env.TEST_BUDGET_YEAR;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;

  if (!scriptId || !testSpreadsheetId || !keyJson) {
    console.error(
      "Missing required env vars. Set APPS_SCRIPT_ID, TEST_SPREADSHEET_ID, and GOOGLE_SERVICE_ACCOUNT_KEY_JSON",
    );
    process.exit(2);
  }

  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/script.projects",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  const client = await auth.getClient();
  const script = google.script({ version: "v1", auth: client });

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

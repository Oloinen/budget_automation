E2E test runner for Apps Script credit-card import

Overview
- This directory contains a small Apps Script runner and a Node helper that invokes it via the Apps Script Execution API.

Files
- `src/e2e/run_credit_card_import_e2e.gs` — Apps Script entrypoint `runCreditCardImportE2E(testSpreadsheetId)` that calls `runCreditCardImport` and returns sheet outputs.
- `test/e2e/run_e2e.js` — Node script to invoke the Apps Script function using a service account.

How to prepare a test spreadsheet
1. Upload the provided CSV `Transactions_All_cardholders_1765825818676.csv` to Google Drive.
2. Open it with Google Sheets and note the spreadsheet ID in the URL (the long id between `/d/` and `/edit`).
3. (Optional) Create blank sheets in the test spreadsheet named `Staging` and `Unknown merchants` — the runner will read them after the import.

Running locally (manual steps)
1. Create a Google Cloud service account with the following roles: `Apps Script API Editor` (or owner for the script), `Drive API` access, and `Sheets` access. Download the JSON key.
2. Deploy your Apps Script project (or use `clasp push`) and note the Apps Script `scriptId` (in `.clasp.json` or the Apps Script dashboard).
3. Set environment variables:

```bash
export APPS_SCRIPT_ID=your-script-id
export TEST_SPREADSHEET_ID=your-test-spreadsheet-id
export GOOGLE_SERVICE_ACCOUNT_KEY_JSON="$(cat /path/to/key.json | jq -c .)"
```

4. Install dependencies and run the Node helper:

```bash
cd budget_automation
npm install googleapis
node test/e2e/run_e2e.js
```

CI (GitHub Actions)
- To run E2E in CI, add repository secrets `APPS_SCRIPT_ID`, `TEST_SPREADSHEET_ID`, and `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` (the full JSON as a single-line string). Create a workflow that sets up Node and runs `node test/e2e/run_e2e.js`.

Notes & limitations
- This runner executes `runCreditCardImportE2E` which delegates to the project's `runCreditCardImport`. The test spreadsheet must have any sheets or layout expected by your import logic, or you must adapt `run_credit_card_import_e2e.gs` to create them before invoking import.
- I cannot execute E2E runs from here because I don't have your Google credentials or spreadsheet access. Provide the secrets or run the steps above locally/CI to execute.

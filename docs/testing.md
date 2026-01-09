# Testing Documentation

## Overview

The Budget Automation system has three layers of testing:
1. **Unit tests** - Pure function testing (no Google APIs)
2. **Integration tests** - Workflow testing with mocked Google APIs
3. **E2E tests** - Full system testing with real Google APIs

## Test Organization

```
apps_script/test/
├── unit/                    # Pure function tests
│   ├── amount.test.js
│   ├── csv.test.js
│   ├── date.test.js
│   ├── findBestRule.test.js
│   ├── makeRow.test.js
│   ├── makeTxId.test.js
│   ├── rounding.test.js
│   ├── sheetUtils.test.js
│   └── unknowns_utils.test.js
├── wrappers/                # Error handler wrapper tests
│   ├── approve_wrapper.test.js
│   └── imports_wrapper.test.js
├── mocks/                   # Mock implementations
│   ├── appsScriptGlobalsMock.js
│   ├── sheetsAdapterMock.js
│   └── tableMock.js
├── fixtures/                # Test data
│   ├── cc_statement_*.csv
│   ├── cloudFunctionResponses.json
│   ├── expectedRows.json
│   └── itemRules.json
├── e2e/                     # End-to-end tests
│   ├── run_full_e2e.js     # Complete workflow suite
│   ├── run_credit_card_e2e.js
│   ├── run_receipts_e2e.js
│   ├── helpers.js
│   ├── seed_test_data.js
│   └── validate_config.js
└── *.test.js                # Integration tests
```

## Running Tests

### Unit & Integration Tests

```bash
npm test                    # Run all Jest tests
npm run test:unit          # Alias for npm test
```

**Coverage**: 19 test suites, 118 tests

### E2E Tests

```bash
npm run test:e2e           # Run full E2E suite
npm run test:e2e:keep      # Keep test files after run
```

**Prerequisites**:
1. Create `.env` from `apps_script/test/e2e/.env.template`
2. Set required environment variables:
   - `APPS_SCRIPT_ID` (test deployment, NOT production)
   - `TEST_TEMPLATE_SHEET_ID`
   - `TEST_FOLDER_ID`
   - `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`

## Unit Tests

### Pure Function Tests

Test utility functions in isolation:

```javascript
const { parseAmount } = require("../../src/core/utils");

test("parseAmount handles European format", () => {
  expect(parseAmount("1.234,56")).toBe(1234.56);
});
```

**Tested modules**:
- `core/utils.js`: Date parsing, amount parsing, normalization, rounding
- `csv.js`: CSV parsing
- `core/unknowns_utils.js`: Unknown item/merchant tracking

## Integration Tests

### Testing Workflows with Mocks

Integration tests use the "wrapper pattern" to test workflows with mocked Google APIs:

```javascript
// Test uses new Function() to execute Apps Script code in Node.js
const code = fs.readFileSync("src/workflows/credit_card/credit_card_import.js", "utf8");

const fn = new Function(
  "require",
  "SpreadsheetApp",
  "DriveApp",
  // ... other globals
  code + "\nreturn { processCreditCardRecords };"
);

const module = fn(
  mockRequire,
  mockSpreadsheetApp,
  mockDriveApp,
  // ...
);

const result = module.processCreditCardRecords(records, options);
```

**Benefits**:
- Tests actual Apps Script code (not transpiled)
- Validates require() calls and module structure
- Fast execution without Google API latency

### Mock Implementations

#### `appsScriptGlobalsMock.js`

Provides mock implementations of Apps Script globals:
- `Utilities.computeDigest()` → Node crypto
- `Logger.log()` → console.log
- `PropertiesService` → in-memory store

#### `sheetsAdapterMock.js`

Mock spreadsheet with getters/setters:
```javascript
const adapter = makeMockAdapter();
adapter.getCell("A1", "2024");
expect(adapter.getCell("A1")).toBe("2024");
```

### Dependency Injection Tests

`credit_card_import.di.test.js` proves DI pattern works:

```javascript
const deps = {
  SpreadsheetApp: mockSpreadsheet,
  DriveApp: mockDrive,
  Session: mockSession,
  getBudgetDataSheetId: () => "test-sheet-id",
  getCreditCardStatementsFolderId: () => "test-folder-id",
  schema: require("../../shared/schema"),
  checkApiQuota: () => true,
};

const result = _runCreditCardImport(deps);
expect(result.success).toBe(true);
```

## E2E Tests

### Architecture

E2E tests use the googleapis npm package to interact with real Google Sheets and Drive:

```javascript
const { google } = require("googleapis");
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets", ...],
});

const sheets = google.sheets({ version: "v4", auth });
const script = google.script({ version: "v1", auth });
```

### Test Flow

1. **Validation** (`validate_config.js`):
   - Check production script ID safeguards
   - Verify all required environment variables
   - Abort if safety checks fail

2. **Setup** (`helpers.js`):
   - Create test spreadsheet from template
   - Upload CSV files to test folder
   - Seed initial data (categories, rules)

3. **Execute** (via Apps Script API):
   ```javascript
   await script.scripts.run({
     scriptId: config.APPS_SCRIPT_ID,
     requestBody: {
       function: "runCreditCardImport",
       parameters: [testSpreadsheetId],
     },
   });
   ```

4. **Validate**:
   - Read sheet data via Sheets API
   - Assert expected rows in correct sheets
   - Verify categorization logic

5. **Cleanup** (unless `SKIP_CLEANUP=true`):
   - Delete test spreadsheet
   - Delete uploaded files

### Production Safety Guards

#### Script ID Validation

```javascript
function validateE2EEnv() {
  const productionIds = (process.env.PRODUCTION_SCRIPT_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (productionIds.includes(process.env.APPS_SCRIPT_ID)) {
    console.error("\n" + "=".repeat(70));
    console.error("FATAL ERROR: Attempting to run E2E tests on PRODUCTION");
    console.error("=".repeat(70));
    process.exit(1);
  }
}
```

#### Production Data Copy Protection

```javascript
if (config.PRODUCTION_BUDGET_DATA_SHEET_ID) {
  if (config.ALLOW_PRODUCTION_COPY !== "true") {
    console.error("Production sheet ID set without ALLOW_PRODUCTION_COPY=true");
    process.exit(1);
  }
  console.warn("⚠️  WARNING: Copying production data for testing");
}
```

### E2E Test Coverage

- ✅ Credit card import workflow
  - CSV parsing and validation
  - Rule matching (automatic/needs_review/unknown)
  - Duplicate detection
  - Sheet routing

- ✅ Receipt import workflow
  - Cloud Function integration
  - OCR text extraction
  - Item parsing and matching
  - File status tracking

- ✅ Approval workflows
  - Merchant approval (cc_staging → transactions_ready)
  - Item approval (receipt_staging → transactions_ready)
  - Unknown merchant approval (create merchant_rules)
  - Unknown item approval (create item_rules)

## Testing Best Practices

### 1. Use Dependency Injection

Make workflows testable by accepting deps:
```javascript
function _myWorkflow(deps) {
  const SpreadsheetApp = deps?.SpreadsheetApp || globalThis.SpreadsheetApp;
  // ...
}
```

### 2. Separate Pure Functions

Extract logic into testable utility functions:
```javascript
// ✅ Good: testable pure function
function parseAmount(str) {
  return Number(str.replace(/[^0-9.-]/g, ""));
}

// ❌ Bad: logic embedded in workflow
function importTransactions() {
  const amount = Number(row[3].replace(/[^0-9.-]/g, ""));
}
```

### 3. Mock External Dependencies

Use mocks for:
- Google Apps Script globals (SpreadsheetApp, DriveApp, etc.)
- Cloud Function calls (UrlFetchApp.fetch)
- Time-dependent functions (new Date())

### 4. Use Fixtures

Store test data in fixtures:
```javascript
const fixtures = require("./fixtures/cloudFunctionResponses.json");
const mockFetch = jest.fn().mockReturnValue(fixtures.successfulResponse);
```

### 5. Validate Production Safety

Always run E2E validation before tests:
```javascript
const { validateE2EEnv } = require("./validate_config");
validateE2EEnv(); // Aborts if production ID detected
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm test  # Unit & integration tests only
```

**Note**: E2E tests require service account credentials and should run manually or in a secure environment.

## Troubleshooting

### "Module not found" in Tests

Ensure mock require function handles all imports:
```javascript
const mockRequire = (path) => {
  if (path === "../../core/runtime-ids") return mockRuntimeIds;
  if (path === "../../../shared/schema") return mockSchema;
  throw new Error(`Mock require: ${path} not mocked`);
};
```

### E2E Tests Fail with 404

Check Apps Script deployment:
1. Ensure script is deployed as executable
2. Grant service account execute permission
3. Verify function names match exactly

### Permission Errors in E2E

Service account needs:
- `roles/editor` on test spreadsheet (or shared explicitly)
- Apps Script API enabled in GCP project
- OAuth scopes: `spreadsheets`, `drive`, `script.projects`

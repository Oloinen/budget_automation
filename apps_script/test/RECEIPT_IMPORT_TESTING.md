# Receipt Import Testing

This directory contains tests for the receipt import functionality.

## Test Files

### `receipt_import.test.js` - Unit Tests

Tests individual functions and logic without external dependencies:

- **Rule Matching**: Tests for equals, contains, and regex matching modes
- **Case Insensitivity**: Verifies pattern matching is case-insensitive
- **Invalid Patterns**: Tests handling of invalid regex patterns
- **Utility Functions**: Tests for `toMonth_()` and `truncate_()`
- **Cloud Function Response**: Tests transformation of Cloud Function responses
- **Item Processing**: Tests item filtering and validation logic

### `receipt_import.mock.test.js` - Integration Tests

Tests the full receipt import flow with mocked Apps Script globals and Cloud Function:

- **File Filtering**: Tests that PDFs and images are processed, other files skipped
- **Cloud Function Integration**: Verifies correct API calls with authentication
- **Sheet Operations**: Tests writing to receipt_files, transactions_ready, receipt_staging
- **Rule Matching**: Tests matching items against item_rules sheet
- **Unknown Items**: Tests tracking of unmatched items
- **Error Handling**: Tests graceful handling of Cloud Function errors
- **Cursor Management**: Tests resumable batch processing with saved cursor

## Mock & Fixture Structure

### Mocks (`mocks/`)

#### `appsScriptGlobalsMock.js`

Provides mock implementations of Apps Script globals:

- **`makeMockSpreadsheet()`**: Creates mock spreadsheet with sheet tracking
- **`makeMockFolder(files)`**: Creates mock Drive folder with file iteration
- **`makeMockFiles()`**: Returns array of mock file objects
- **`makeMockProperties()`**: Creates mock script properties storage
- **`makeMockUrlFetchApp(responseHandler)`**: Creates mock HTTP client with request logging
- **`setupAppsScriptGlobals(options)`**: One-step setup of all mocks

Usage:

```javascript
const { setupAppsScriptGlobals } = require("./mocks/appsScriptGlobalsMock");
const mocks = setupAppsScriptGlobals({
  cloudFunctionResponse: yourResponse,
});
```

#### `sheetsAdapterMock.js`

Mock adapter for sheet operations (used by credit card import tests too).

### Fixtures (`fixtures/`)

Fixtures are split between **JSON files** (pure data) and **JavaScript files** (behavioral mocks).

#### JSON Files (Pure Data)

**`cloudFunctionResponses.json`**
Pre-built Cloud Function response scenarios:

- `successfulResponse`: Receipt with multiple items
- `noItemsResponse`: Receipt with no items parsed
- `minimalResponse`: Receipt with missing fields
- `errorResponse`: Error response from Cloud Function
- `sMarketResponse`: S-Market specific receipt
- `allMatchedResponse`: Receipt where all items match rules

**`itemRules.json`**
Pre-defined rule sets:

- `basic`: Essential rules (maito, leipä, juusto)
- `comprehensive`: Extended rules including household items
- `withModes`: Rules demonstrating different match modes
- `empty`: Empty rule set for testing

**`expectedRows.json`**
Expected sheet row data for assertions:

- `receiptFiles`: processed, error
- `transactionsReady`: matched
- `receiptStaging`: needsRule, noItems
- `unknownItems`: first

**`receiptItems.json`**
Sample items for different scenarios:

- `matched`: Items that should match rules
- `unmatched`: Items that won't match any rules
- `mixed`: Mix of matched and unmatched items
- `withEmpty`: Items including empty names

#### JavaScript Files (Behavioral Mocks)

**`cloudFunctionResponses.js`**
Factory functions for creating dynamic responses:

- `makeHttpErrorResponse(code, msg)`: Creates HTTP error responses (returns object with methods)
- `makeCloudFunctionResponse(options)`: Custom response builder
- Re-exports all JSON responses for convenience

**`receiptData.js`**
Mock objects with methods:

- `receiptFiles`: Mock file objects with `getId()`, `getName()`, `getMimeType()` methods
- `cursorStates`: Cursor states for testing resumable processing
- Re-exports itemRules, expectedRows, receiptItems from JSON

## Running Tests

### Run all receipt import tests:

```bash
npm test -- receipt_import
```

### Run only unit tests:

```bash
npm test -- receipt_import.test
```

### Run only integration/mock tests:

```bash
npm test -- receipt_import.mock
```

### Run all tests:

```bash
npm test
```

## Test Coverage

The tests cover:

- ✅ File type filtering (PDF, JPG, PNG supported)
- ✅ Cloud Function authentication and response handling
- ✅ Item rule matching (equals, contains, regex modes)
- ✅ Transaction creation for matched items
- ✅ Staging entries for unmatched items
- ✅ Unknown item tracking with counts
- ✅ Receipt file logging with status
- ✅ Error handling and status tracking
- ✅ Cursor-based resumable processing
- ✅ Empty item filtering
- ✅ Date and string utility functions

## Using Mocks and Fixtures in Tests

### Basic Setup

```javascript
const { setupAppsScriptGlobals } = require("./mocks/appsScriptGlobalsMock");
const { successfulResponse } = require("./fixtures/cloudFunctionResponses");
const { itemRules, receiptItems } = require("./fixtures/receiptData");

// Setup all mocks
const mocks = setupAppsScriptGlobals({
  cloudFunctionResponse: successfulResponse,
});

// Access mocked objects
const sheet = mocks.mockSpreadsheet.getSheetByName("transactions_ready");
const rulesSheet = mocks.mockSpreadsheet.getSheetByName("item_rules");

// Populate with test data
itemRules.basic.forEach((rule) => rulesSheet.appendRow(rule));
```

### Custom Response Handling

```javascript
const { setupAppsScriptGlobals } = require("./mocks/appsScriptGlobalsMock");

const mocks = setupAppsScriptGlobals({
  customResponseHandler: (request) => {
    if (request.payload.fileId === "error-file") {
      return {
        getResponseCode: () => 500,
        getContentText: () => "Internal Server Error",
      };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ ok: true, result: {} }),
    };
  },
});
```

### Inspecting Mock State

```javascript
// Check what was written to sheets
const filesSheet = mocks.mockSpreadsheet.getSheetByName("receipt_files");
expect(filesSheet._data.length).toBe(1);
expect(filesSheet._data[0][4]).toBe("PROCESSED");

// Check HTTP requests made
const requestLog = mocks.mockUrlFetchApp._getRequestLog();
expect(requestLog.length).toBe(1);
expect(requestLog[0].payload.fileId).toBe("test-file-123");

// Check script properties
const cursor = mocks.mockProps.getProperty("RECEIPT_IMPORT_CURSOR_NAME");
expect(cursor).toBe("receipt2.jpg");
```

## Mock Structure

The mock tests use:

- **Mock Apps Script globals**: SpreadsheetApp, DriveApp, PropertiesService, UrlFetchApp, ScriptApp
- **Mock Cloud Function**: Returns test receipt data with items
- **Mock sheets**: In-memory sheet implementation tracking appendRow calls
- **Mock files**: Test PDF, JPG, and TXT files with different mime types

## Adding New Tests

When adding functionality to receipt_import.js:

1. **Add unit test** in `receipt_import.test.js` for pure logic functions
2. **Add integration test** in `receipt_import.mock.test.js` for full flow scenarios
3. **Create fixtures** in `fixtures/` for reusable test data
4. **Extend mocks** in `mocks/` if new Apps Script APIs are needed
5. Update this README with new test coverage

### Example: Adding a New Test

```javascript
// In receipt_import.mock.test.js
const { setupAppsScriptGlobals } = require("./mocks/appsScriptGlobalsMock");
const { sMarketResponse } = require("./fixtures/cloudFunctionResponses");
const { itemRules } = require("./fixtures/receiptData");

test("should process S-Market receipts correctly", () => {
  const mocks = setupAppsScriptGlobals({
    cloudFunctionResponse: sMarketResponse,
  });

  const rulesSheet = mocks.mockSpreadsheet.getSheetByName("item_rules");
  itemRules.comprehensive.forEach((rule) => rulesSheet.appendRow(rule));

  // Your test logic here
});
```

## Test Data

### Example Cloud Function Response (from fixtures)

```javascript
const successfulResponse = {
  ok: true,
  result: {
    date: "2026-01-05",
    merchant: "K-Market",
    total: 15.67,
    items: [
      { name: "Maito 1L", amount: 1.89 },
      { name: "Ruisleipä", amount: 2.5 },
      { name: "Unknown Item", amount: 3.99 },
    ],
    raw_text: "K-Market\\n05.01.2026\\n...",
  },
};
```

### Example Item Rules (from fixtures)

```javascript
const itemRules = {
  basic: [
    ["maito", "Food", "Groceries", "contains"],
    ["leipä", "Food", "Groceries", "contains"],
    ["juusto", "Food", "Groceries", "contains"],
  ],
};
```

## Known Limitations

- Tests use mocks, not real Apps Script environment
- Cloud Function is mocked, not actually called
- No tests for time budget enforcement (6-minute limit)
- No tests for concurrent execution scenarios

## File Structure

```
apps_script/test/
├── receipt_import.test.js                  # Unit tests
├── receipt_import.mock.test.js             # Integration tests with mocks
├── RECEIPT_IMPORT_TESTING.md               # This file
├── mocks/
│   ├── appsScriptGlobalsMock.js            # Apps Script global object mocks
│   └── sheetsAdapterMock.js                # Sheet adapter mock (shared)
└── fixtures/
    ├── cloudFunctionResponses.json         # Response data (JSON)
    ├── cloudFunctionResponses.js           # Response helpers (JS)
    ├── itemRules.json                      # Rule data (JSON)
    ├── expectedRows.json                   # Expected row data (JSON)
    ├── receiptItems.json                   # Item data (JSON)
    └── receiptData.js                      # Receipt mocks with methods (JS)
```

## Design Principles

### JSON for Pure Data ✅

- API responses
- Configuration data
- Expected outputs
- Test data that's just data

**Benefits:**

- Language agnostic
- Can validate against schemas
- Clean version control diffs
- Easy to read and edit

### JavaScript for Behavioral Mocks ✅

- Objects with methods
- Factory functions
- Mock implementations with logic

**Benefits:**

- Can include functions
- Dynamic values
- Can reference other modules
- Complex behaviors

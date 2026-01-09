# Budget Automation Architecture

## Overview

Budget Automation is a Google Apps Script-based system that automatically imports and categorizes financial transactions from credit card statements and receipt images. It integrates with a Google Cloud Function for OCR processing and uses Google Sheets as its database.

## System Components

### 1. Apps Script Runtime (`apps_script/src/`)

The main application logic runs in Google Apps Script, providing:
- **Scheduled workflows** for automated imports
- **Manual approval workflows** for unknown transactions
- **Integration with Google Drive** for file storage
- **Integration with Google Sheets** for data persistence

### 2. Cloud Function (`cloud_function/receipt_extractor/`)

A Python-based Google Cloud Function that:
- Extracts text from receipt images (JPG, PNG) and PDFs using OCR
- Parses receipt data (merchant, date, total, line items)
- Returns structured JSON for processing

### 3. Shared Schema (`shared/schema/`)

JSON schemas defining:
- Sheet tab names and headers
- Transaction structures
- Rule formats (merchant rules, item rules)
- Receipt result format

## Architecture Patterns

### Dependency Injection

**Problem**: Apps Script globals (SpreadsheetApp, DriveApp, etc.) are hard to mock in tests.

**Solution**: Workflows accept a `deps` object with injected dependencies:

```javascript
function _runCreditCardImport(deps) {
  const SpreadsheetApp = deps?.SpreadsheetApp || globalThis.SpreadsheetApp;
  const DriveApp = deps?.DriveApp || globalThis.DriveApp;
  // ... workflow logic using injected dependencies
}

function runCreditCardImport(deps) {
  if (!deps) {
    // Create deps from globals for Apps Script runtime
    deps = {
      SpreadsheetApp: globalThis.SpreadsheetApp,
      DriveApp: globalThis.DriveApp,
      // ...
    };
  }
  return _runCreditCardImport(deps);
}
```

**Benefits**:
- Testable in Node.js/Jest without Apps Script runtime
- Backwards compatible (fallback to globals)
- Enables E2E testing with real Google APIs

### Configuration Management

**Location**: `apps_script/src/core/config.js` and `runtime-ids.js`

**Precedence** (highest to lowest):
1. PropertiesService (Apps Script runtime)
2. process.env (Node.js testing)
3. config.local.js (local development overrides)

**General Config** (`config.js`):
- Budget year
- Notification email
- Feature flags

**Runtime Resource IDs** (`runtime-ids.js`):
- Budget spreadsheet ID
- Drive folder IDs
- Cloud Function URL
- Provides getters/setters with in-memory overrides for testing

### Error Handling

**Location**: `apps_script/src/core/error_handler.js`

Standardized error handling for all workflows:

```javascript
function myWorkflow() {
  const { handleWorkflowErrors } = require("../../core/error_handler");
  return handleWorkflowErrors("MyWorkflow", deps, () => {
    // ... workflow logic
  });
}
```

**Features**:
- Consistent error logging with stack traces
- Email notifications on failures
- Structured error responses: `{success, message, code?, details?}`
- Quota error detection and reporting

### Data Flow

#### Credit Card Import

```
1. Drive Folder (CSV files)
   ↓
2. Parse CSV → Records
   ↓
3. Match against merchant_rules
   ↓
4. Route to sheets:
   - Matched + automatic → transactions_ready
   - Matched + needs_review → cc_staging (manual approval)
   - Unmatched → cc_staging + unknown_merchants
   - Invalid → cc_skipped
```

#### Receipt Import

```
1. Drive Folder (Images/PDFs)
   ↓
2. Call Cloud Function (OCR + parsing)
   ↓
3. Extract: merchant, date, total, items[]
   ↓
4. Match items against item_rules
   ↓
5. Route to sheets:
   - Matched → transactions_ready
   - Unmatched → receipt_staging + unknown_items
   - File metadata → receipt_files
```

## Sheet Structure

### Core Sheets

- **transactions_ready**: Approved transactions ready for budget analysis
- **categories**: Valid category/group combinations
- **config**: Budget year and settings

### Credit Card Sheets

- **cc_staging**: Transactions awaiting manual categorization
- **cc_skipped**: Invalid/duplicate transactions
- **merchant_rules**: Patterns for auto-categorization
- **unknown_merchants**: New merchants needing rules

### Receipt Sheets

- **receipt_staging**: Items awaiting manual categorization
- **receipt_files**: File processing status and metadata
- **item_rules**: Patterns for receipt item matching
- **unknown_items**: New items needing rules

## Performance Considerations

### Batch Operations

Import workflows use `appendRows()` to write multiple rows in one API call:

```javascript
const rows = records.map(r => makeRow(headerMap, r));
appendRows(sheet, rows); // Single API call
```

### Rules Matching

- Rules are sorted longest-first for best-match priority
- Linear scan is efficient for typical rule counts (< 500)
- Uses normalized strings (lowercase, collapsed whitespace)

### Time Budget

Receipt import enforces a 5.3-minute time budget:
- Prevents Apps Script 6-minute timeout
- Processes files in chunks across multiple runs
- Tracks elapsed time and exits gracefully

## Security

### Sensitive Data

- Resource IDs stored in PropertiesService (not in code)
- Service account credentials in environment variables (E2E tests)
- Cloud Function uses Bearer token authentication

### Production Safety

E2E tests prevent accidental production runs:
- `PRODUCTION_SCRIPT_IDS` environment variable lists production Apps Script IDs
- Tests abort if `APPS_SCRIPT_ID` matches any production ID
- `ALLOW_PRODUCTION_COPY` flag required to copy production data

## Deployment

### Apps Script

1. Use clasp or Apps Script web editor
2. Set up Script Properties via `setup_properties.js`
3. Install time-based triggers via `triggers.js`

### Cloud Function

```bash
cd cloud_function/receipt_extractor
./deploy.sh  # Deploys to Google Cloud Functions
```

## Testing Strategy

See [testing.md](./testing.md) for comprehensive testing documentation.

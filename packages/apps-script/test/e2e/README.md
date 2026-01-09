# E2E Testing

End-to-end integration tests for Budget Automation Apps Script.

## Overview

E2E tests validate the complete workflow by:

1. Creating test spreadsheets from templates
2. Uploading fixture CSV files
3. Running Apps Script import/approval functions
4. Validating data landed correctly
5. Cleaning up test files

## Test Files

- **`run_full_e2e.js`** - Comprehensive E2E suite (recommended, used by CI)
- **`run_e2e.js`** - Legacy single-function runner (credit card import only)
- **`copy_sheet.js`** - Utility to copy spreadsheets programmatically

## Quick Start

### Prerequisites

```bash
# Install googleapis
npm install googleapis
```

### Local Testing (Comprehensive Suite)

```bash
# Set environment variables
export GOOGLE_SERVICE_ACCOUNT_KEY_JSON='{"type":"service_account",...}'
export APPS_SCRIPT_ID='your-apps-script-id'
export TEST_TEMPLATE_SHEET_ID='your-template-spreadsheet-id'
export TEST_FOLDER_ID='your-test-folder-id'

# Run full E2E suite
node test/e2e/run_full_e2e.js

# Keep test files for inspection (skip cleanup)
SKIP_CLEANUP=true node test/e2e/run_full_e2e.js
```

### GitHub Actions (Automated CI)

Tests run automatically on push/PR. See [`../../.github/SETUP_CI.md`](../../.github/SETUP_CI.md) for complete setup instructions.

## Environment Variables

### Required Variables

| Variable                          | Description                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | Full JSON content of service account key                                                       |
| `APPS_SCRIPT_ID`                  | Your Apps Script project ID (⚠️ **must be test/staging, NOT production**)                     |
| `TEST_TEMPLATE_SHEET_ID`          | Template spreadsheet ID for creating test sheets                                               |
| `TEST_FOLDER_ID`                  | Google Drive folder ID for test files                                                          |

### Optional Variables

| Variable                          | Description                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `TEST_RECEIPTS_FOLDER_ID`         | Google Drive folder ID for test receipt files (required for receipt import testing)            |
| `TEST_BUDGET_YEAR`                | Year for testing, defaults to 2026                                                             |
| `SKIP_CLEANUP`                    | Set to `true` to keep test files after run for inspection                                     |
| `MOCK_GOOGLEAPI`                  | Set to `1` to use mock Google API for faster development                                       |

### Production Safety Variables

| Variable                          | Description                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `PRODUCTION_SCRIPT_IDS`           | Comma-separated list of production Apps Script IDs. Tests will **abort** if `APPS_SCRIPT_ID` matches any production ID |
| `PRODUCTION_BUDGET_DATA_SHEET_ID` | Production spreadsheet ID (only needed for copying production data with explicit permission)   |
| `ALLOW_PRODUCTION_COPY`           | Must be set to `true` to allow copying production spreadsheet data (use with extreme caution)  |

## Production Safety Guards

The E2E test suite includes multiple safety mechanisms to prevent accidental production runs:

1. **Production Script ID Check**: Set `PRODUCTION_SCRIPT_IDS` in your `.env` to list all production Apps Script project IDs. Tests will abort with a fatal error if `APPS_SCRIPT_ID` matches any production ID.

2. **Production Data Copy Protection**: If you need to copy a production spreadsheet for testing:
   - Set `PRODUCTION_BUDGET_DATA_SHEET_ID` to the production sheet ID
   - Set `ALLOW_PRODUCTION_COPY=true` to explicitly confirm you understand the risks
   - Tests will warn but proceed with caution
   - Without `ALLOW_PRODUCTION_COPY=true`, tests will abort if production sheet ID is detected

3. **Validation Before Execution**: All test runners call `validateE2EEnv()` which checks these safety guards before any Google API calls are made.

## Test Coverage

The full E2E suite (`run_full_e2e.js`) tests:

### Setup Phase

- ✅ Spreadsheet creation from template
- ✅ CSV file upload to Drive
- ✅ Test data seeding (categories, merchant rules)

### Workflow Tests

- ✅ **Credit card import workflow** - CSV parsing, categorization, unknown tracking
- ✅ **Receipt import workflow** - Cloud Function OCR, item parsing, categorization (optional - requires TEST_RECEIPTS_FOLDER_ID)
  - Uploads test receipt files to Drive
  - Seeds item rules for matching
  - Calls receipt-extractor Cloud Function
  - Validates processed receipts in receipt_files
  - Checks matched items in transactions_ready
  - Verifies staging and unknown_items for unmatched items
- ✅ **Merchant approval workflow** - Manual categorization approval
  - Seeds test staging entries with manual categories
  - Validates entries move to `transactions_ready`
  - Validates staging sheet is cleared
  - Validates proper category matching
- ✅ **Unknown merchants approval** - Rule creation from unknowns
  - Seeds test unknown merchants with categories and modes
  - Validates merchant rules are created correctly
  - Validates rule details (merchant, category, mode)
  - Validates unknown_merchants sheet is cleared
- ✅ **Receipt item approval workflow** - Manual receipt item categorization
  - Seeds test receipt_staging entries with manual categories
  - Validates items move to `transactions_ready`
  - Validates receipt_staging sheet is cleared
  - Validates proper category matching
- ✅ **Unknown items approval** - Item rule creation from unknowns
  - Seeds test unknown items with categories and modes
  - Validates item rules are created correctly
  - Validates rule details (pattern, category, mode)
  - Validates unknown_items sheet is cleared

### Validation

- ✅ Data structure validation (headers, required fields)
- ✅ Transaction data integrity checks
- ✅ Sheet state verification after each workflow

### Cleanup

- ✅ Automatic test file deletion (or keep with `SKIP_CLEANUP=true`)

## Legacy Runner (run_e2e.js)

For testing single credit card import only:

```bash
export APPS_SCRIPT_ID=your-script-id
export TEST_SPREADSHEET_ID=existing-test-spreadsheet-id
export GOOGLE_SERVICE_ACCOUNT_KEY_JSON='...'

node test/e2e/run_e2e.js
```

## Service Account Setup

See [`../../.github/SETUP_CI.md`](../../.github/SETUP_CI.md) for detailed instructions on:

- Creating service account
- Granting necessary permissions
- Generating and configuring keys

## Troubleshooting

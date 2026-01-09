# Budget Automation

Automated financial transaction import and categorization system using Google Apps Script, Google Sheets, and Google Cloud Functions.

## Features

- **Credit Card Import**: Automatically import and categorize transactions from CSV statements
- **Receipt Processing**: OCR-based receipt scanning with line-item extraction
- **Rule-Based Categorization**: Auto-categorize transactions using merchant and item rules
- **Manual Approval Workflows**: Review and approve unknown transactions
- **Duplicate Detection**: Prevent duplicate transaction imports
- **Time-Based Automation**: Scheduled daily imports with Apps Script triggers

## Quick Start

### Prerequisites

- Google Apps Script project
- Google Cloud Platform project (for receipt OCR)
- Google Sheets spreadsheet for data storage
- Node.js 18+ (for testing)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd budget_automation
   npm install
   ```

2. **Configure Apps Script**
   - Create a new Apps Script project or use clasp to push code
   - Run `setup_properties.js` to configure Script Properties
   - Install time-based triggers via `triggers.js`

3. **Deploy Cloud Function** (for receipt processing)
   ```bash
   cd cloud_function/receipt_extractor
   ./deploy.sh
   ```

4. **Set up test environment** (optional)
   ```bash
   cp apps_script/test/e2e/.env.template apps_script/test/e2e/.env
   # Edit .env with your test credentials
   ```

## Project Structure

```
budget_automation/
├── apps_script/
│   ├── src/                    # Apps Script source code
│   │   ├── core/              # Core utilities and config
│   │   ├── workflows/         # Business logic workflows
│   │   │   ├── credit_card/   # Credit card import & approval
│   │   │   ├── receipts/      # Receipt import & approval
│   │   │   └── budget/        # Budget creation
│   │   ├── triggers/          # Time-based trigger setup
│   │   └── setup_properties.js
│   └── test/                  # Test suite
│       ├── unit/              # Pure function tests
│       ├── mocks/             # Mock implementations
│       └── e2e/               # End-to-end tests
├── cloud_function/
│   └── receipt_extractor/     # Python OCR service
├── shared/
│   └── schema/                # Shared JSON schemas
├── docs/
│   ├── architecture.md        # System architecture
│   ├── testing.md             # Testing guide
│   └── setup.md               # Setup instructions
└── scripts/                   # Utility scripts
    └── backup_budget_data.py
```

## Documentation

- **[Architecture](docs/architecture.md)** - System design, patterns, and data flow
- **[Testing](docs/testing.md)** - Testing strategy and best practices
- **[Setup](docs/setup.md)** - Detailed setup and configuration guide

## Usage

### Credit Card Import

1. Upload CSV statements to configured Drive folder
2. Run manually: Execute `runCreditCardImport()` in Apps Script
3. Or wait for scheduled trigger (daily at 4:00 AM)

Transactions are routed to:
- `transactions_ready` - Auto-categorized transactions
- `cc_staging` - Needs manual category approval
- `unknown_merchants` - New merchants needing rules

### Receipt Import

1. Upload receipt images/PDFs to configured Drive folder
2. Run manually: Execute `importReceiptsFromFolder()` in Apps Script
3. Cloud Function extracts text and parses line items
4. Items are matched against rules and routed appropriately

### Approval Workflows

Execute these functions to approve staged transactions:
- `approveMerchantStagingEntries()` - Approve manually categorized credit card transactions
- `approveUnknownMerchants()` - Create rules for unknown merchants
- `approveItemStagingEntries()` - Approve manually categorized receipt items
- `approveUnknownItems()` - Create rules for unknown items

## Testing

```bash
# Run unit and integration tests
npm test

# Run E2E tests (requires configuration)
npm run test:e2e

# Keep test files for inspection
npm run test:e2e:keep
```

See [testing.md](docs/testing.md) for detailed testing documentation.

## Configuration

### Script Properties

Set via `setup_properties.js` in Apps Script editor:
- `BUDGET_DATA_SHEET_ID` - Main spreadsheet ID
- `CREDIT_CARD_STATEMENTS_FOLDER_ID` - Drive folder for CSV files
- `RECEIPTS_FOLDER_ID` - Drive folder for receipt images
- `RECEIPT_EXTRACTOR_URL` - Cloud Function endpoint
- `NOTIFY_EMAIL` - Email for error notifications

### Environment Variables (Testing)

Create `apps_script/test/e2e/.env`:
```bash
APPS_SCRIPT_ID=your-test-script-id
TEST_TEMPLATE_SHEET_ID=your-template-sheet-id
TEST_FOLDER_ID=your-test-folder-id
GOOGLE_SERVICE_ACCOUNT_KEY_JSON='{"type":"service_account",...}'
PRODUCTION_SCRIPT_IDS=prod-id-1,prod-id-2  # Safety guard
```

## Development

### Architecture Patterns

- **Dependency Injection**: Workflows accept `deps` object for testability
- **Error Handling**: Centralized via `handleWorkflowErrors()` adapter
- **Configuration**: Multi-layer with PropertiesService → process.env → config.local.js
- **Batch Operations**: Sheet writes batched for performance
- **Retry Logic**: Cloud Function calls with exponential backoff

### Adding a New Workflow

1. Create workflow function in `apps_script/src/workflows/`
2. Accept `deps` object for dependency injection
3. Wrap with `handleWorkflowErrors()` for consistent error handling
4. Add unit tests in `apps_script/test/unit/`
5. Add integration test in `apps_script/test/`
6. Add E2E test in `apps_script/test/e2e/`

Example:
```javascript
function _myWorkflow(deps) {
  const SpreadsheetApp = deps?.SpreadsheetApp || globalThis.SpreadsheetApp;
  // ... workflow logic
}

function myWorkflow(deps) {
  const { handleWorkflowErrors } = require("../../core/error_handler");
  return handleWorkflowErrors("MyWorkflow", deps, () => _myWorkflow(deps));
}
```

## Contributing

1. Create feature branch from `master`
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Update documentation as needed
5. Submit pull request

## License

[Your License Here]

## Support

For issues, questions, or contributions, please open an issue on the repository.

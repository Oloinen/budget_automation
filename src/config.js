const BUDGET_YEAR = 2026;

const BUDGET_DATA_SHEET_ID = "PUT_BUDGET_DATA_SPREADSHEET_ID_HERE";
const CREDIT_CARD_STATEMENTS_FOLDER_ID = "PUT_DRIVE_FOLDER_ID_WITH_STATEMENTS_HERE"; // where the growing statement CSV lives

// CSV columns (must match header row exactly)
const CSV_COL_DATE = "Date of payment";
const CSV_COL_MERCHANT = "Location of purchase";
const CSV_COL_AMOUNT = "Transaction amount";

// Tab names
const TAB_MERCHANT_RULES = "merchant_rules";
const TAB_CC_STAGING = "credit_card_staging";
const TAB_CC_READY = "credit_card_ready";
const TAB_CC_SKIPPED = "credit_card_skipped";
const TAB_MERCHANTS_UNKNOWN = "unknown_merchants";

// Status values
const STATUS_NEEDS_REVIEW = "needs_review";
const STATUS_BLOCKED = "blocked"; // suggested "opposite to verified" for skipped? For skipped we use verified=false

// How to pick which CSV to read:
const READ_ONLY_LATEST_CSV = true; // set false to process all CSVs in folder
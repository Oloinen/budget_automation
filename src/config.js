const BUDGET_YEAR = 2026;

// CSV columns (must match header row exactly)
const CSV_COL_DATE = "Date of payment";
const CSV_COL_MERCHANT = "Location of purchase";
const CSV_COL_AMOUNT = "Transaction amount";

// Credit card tab names
const TAB_MERCHANT_RULES = "merchant_rules";
const TAB_CC_STAGING = "credit_card_staging";
const TAB_CC_SKIPPED = "credit_card_skipped";
const TAB_MERCHANTS_UNKNOWN = "unknown_merchants";

// Receipt-related tabs
const TAB_RECEIPT_STAGING = "receipt_staging";
const TAB_RECEIPT_FILES = "receipt_files";
const TAB_ITEM_RULES = "item_rules";
const TAB_UNKNOWN_ITEMS = "unknown_items";

// Shared tab
const TAB_TRANSACTIONS_READY = "transactions_ready";

// Expected headers for key tabs (useful for mocks/tests)
const HEADERS_TRANSACTIONS_READY = ["tx_id","date","month","merchant","amount","group","category","posted_at","source"];
const HEADERS_CC_STAGING = ["tx_id","date","merchant","amount","rule_mode","group","category","posted_at","status"];
const HEADERS_UNKNOWN_MERCHANTS = ["merchant","group","category","mode","count","first_seen","last_seen"];
const HEADERS_MERCHANT_RULES = ["merchant","group","category","mode"];
const HEADERS_CC_SKIPPED = ["tx_id","date","merchant","amount","receipt_id","status","completed_at"];
const HEADERS_RECEIPT_STAGING = ["tx_id","date","receipt_id","merchant","amount","raw_ocr","group","category","posted_at","status"];
const HEADERS_RECEIPT_FILES = ["receipt_id","file_id","file_name","imported_at","status","detected_date","detected_merchant","detected_amount","is_verified","note"];
const HEADERS_ITEM_RULES = ["pattern","group","category","mode"];
const HEADERS_UNKNOWN_ITEMS = ["pattern","group","category","mode","count","first_seen","last_seen"];

// Status values
const STATUS_NEEDS_REVIEW = "needs_review";
const STATUS_BLOCKED = "blocked"; // suggested "opposite to verified" for skipped? For skipped we use verified=false

// How to pick which CSV to read:
const READ_ONLY_LATEST_CSV = true; // set false to process all CSVs in folder

// Export values and a small helper for Node-based tests to override globals.
if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		BUDGET_YEAR,
		BUDGET_DATA_SHEET_ID,
		CREDIT_CARD_STATEMENTS_FOLDER_ID,
		CSV_COL_DATE,
		CSV_COL_MERCHANT,
		CSV_COL_AMOUNT,
			TAB_MERCHANT_RULES,
			TAB_CC_STAGING,
			TAB_TRANSACTIONS_READY,
			TAB_CC_SKIPPED,
			TAB_MERCHANTS_UNKNOWN,
			TAB_RECEIPT_STAGING,
			TAB_RECEIPT_FILES,
			TAB_ITEM_RULES,
			TAB_UNKNOWN_ITEMS,
		STATUS_NEEDS_REVIEW,
		STATUS_BLOCKED,
		READ_ONLY_LATEST_CSV,
			// Header arrays
			HEADERS_TRANSACTIONS_READY,
			HEADERS_CC_STAGING,
			HEADERS_UNKNOWN_MERCHANTS,
			HEADERS_MERCHANT_RULES,
			HEADERS_CC_SKIPPED,
			HEADERS_RECEIPT_STAGING,
			HEADERS_RECEIPT_FILES,
			HEADERS_ITEM_RULES,
			HEADERS_UNKNOWN_ITEMS,
		// Call in tests to set globals so legacy code referencing top-level consts will pick them up.
		setTestOverrides: function (overrides) {
			try {
				const g = (typeof global !== 'undefined') ? global : (typeof globalThis !== 'undefined' ? globalThis : null);
				if (!g) return;
				for (const k of Object.keys(overrides || {})) {
					try { g[k] = overrides[k]; } catch (e) { /* ignore */ }
				}
			} catch (e) {
				// no-op
			}
		}
	};
}
const BUDGET_YEAR = 2026;

/***********************
 * CONFIGURATION HELPERS
 * Use Apps Script Properties Service for sensitive IDs
 ***********************/

/**
 * Get a configuration value from Script Properties.
 * Falls back to environment variables in Node.js test environment.
 * @param {string} key - The property key
 * @param {string} [fallback=''] - Fallback value if not found
 * @returns {string} The property value
 */
function getScriptProperty(key, fallback) {
  if (typeof fallback === "undefined") fallback = "";
  // Apps Script environment
  if (typeof PropertiesService !== "undefined") {
    try {
      var value = PropertiesService.getScriptProperties().getProperty(key);
      return value !== null ? value : fallback;
    } catch (e) {
      return fallback;
    }
  }
  // Node.js test environment - check global first, then process.env
  if (typeof global !== "undefined" && global[key]) {
    return global[key];
  }
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key];
  }
  return fallback;
}

// Sensitive IDs - loaded from Script Properties (not hardcoded)
var BUDGET_DATA_SHEET_ID = getScriptProperty("BUDGET_DATA_SHEET_ID");
var CREDIT_CARD_STATEMENTS_FOLDER_ID = getScriptProperty("CREDIT_CARD_STATEMENTS_FOLDER_ID");
var RECEIPTS_FOLDER_ID = getScriptProperty("RECEIPTS_FOLDER_ID");
var RECEIPT_EXTRACTOR_URL = getScriptProperty("RECEIPT_EXTRACTOR_URL");

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

// Shared tabs
const TAB_TRANSACTIONS_READY = "transactions_ready";
const TAB_CATEGORIES = "categories";

/***********************
 * SHEET SCHEMA (Single Source of Truth)
 * Tab names defined above (TAB_*), headers below (HEADERS_*)
 ***********************/
const HEADERS_TRANSACTIONS_READY = [
  "tx_id",
  "date",
  "month",
  "merchant",
  "amount",
  "group",
  "category",
  "posted_at",
  "source",
];
const HEADERS_CC_STAGING = [
  "tx_id",
  "date",
  "merchant",
  "amount",
  "rule_mode",
  "group",
  "category",
  "posted_at",
  "status",
];
const HEADERS_UNKNOWN_MERCHANTS = [
  "merchant",
  "group",
  "category",
  "mode",
  "count",
  "first_seen",
  "last_seen",
  "status",
];
const HEADERS_MERCHANT_RULES = ["merchant", "group", "category", "mode"];
const HEADERS_CC_SKIPPED = [
  "tx_id",
  "date",
  "merchant",
  "amount",
  "receipt_id",
  "status",
  "completed_at",
];
const HEADERS_RECEIPT_STAGING = [
  "tx_id",
  "date",
  "receipt_id",
  "merchant",
  "amount",
  "group",
  "category",
  "posted_at",
  "status",
  "raw_ocr",
];
const HEADERS_RECEIPT_FILES = [
  "receipt_id",
  "file_id",
  "file_name",
  "imported_at",
  "status",
  "retry_count",
  "detected_date",
  "detected_merchant",
  "detected_amount",
  "is_verified",
  "note",
];
const HEADERS_ITEM_RULES = ["pattern", "group", "category", "mode"];
const HEADERS_UNKNOWN_ITEMS = [
  "pattern",
  "group",
  "category",
  "mode",
  "count",
  "first_seen",
  "last_seen",
  "status",
];
const HEADERS_CATEGORIES = ["group", "category", "subcategory", "active"];

/**
 * Accepted values for various fields across sheets:
 *
 * status:
 *   - receipt_staging: "NEEDS_REVIEW", "NEEDS_RULE", "APPROVED"
 *   - receipt_files: "PROCESSED", "ERROR"
 *   - credit_card_staging: "NEEDS_REVIEW", "APPROVED"
 *   - credit_card_skipped: "SKIPPED"
 *
 * mode:
 *   - item_rules: "auto", "review"
 *   - merchant_rules: "auto", "review", "skip"
 *
 * is_verified:
 *   - receipt_files: true, false (boolean)
 *   - credit_card_skipped: true, false (boolean)
 */

// Status constants
const STATUS_NEEDS_REVIEW = "NEEDS_REVIEW";
const STATUS_NEEDS_RULE = "NEEDS_RULE";
const STATUS_APPROVED = "APPROVED";
const STATUS_PROCESSED = "PROCESSED";
const STATUS_ERROR = "ERROR";
const STATUS_FAILED_PERMANENTLY = "FAILED_PERMANENTLY";
const STATUS_SKIPPED = "SKIPPED";

// Mode constants
const MODE_AUTO = "auto";
const MODE_REVIEW = "review";
const MODE_SKIP = "skip";

// How to pick which CSV to read:
const READ_ONLY_LATEST_CSV = true; // set false to process all CSVs in folder

// Export values and a small helper for Node-based tests to override globals.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BUDGET_YEAR,
    getScriptProperty,
    BUDGET_DATA_SHEET_ID,
    CREDIT_CARD_STATEMENTS_FOLDER_ID,
    RECEIPTS_FOLDER_ID,
    RECEIPT_EXTRACTOR_URL,
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
    TAB_CATEGORIES,
    STATUS_NEEDS_REVIEW,
    STATUS_NEEDS_RULE,
    STATUS_APPROVED,
    STATUS_PROCESSED,
    STATUS_FAILED_PERMANENTLY,
    STATUS_ERROR,
    STATUS_SKIPPED,
    MODE_AUTO,
    MODE_REVIEW,
    MODE_SKIP,
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
    HEADERS_CATEGORIES,
    // Call in tests to set globals so legacy code referencing top-level consts will pick them up.
    setTestOverrides: function (overrides) {
      try {
        const g =
          typeof global !== "undefined"
            ? global
            : typeof globalThis !== "undefined"
            ? globalThis
            : null;
        if (!g) return;
        for (const k of Object.keys(overrides || {})) {
          try {
            g[k] = overrides[k];
          } catch (e) {
            /* ignore */
          }
        }
      } catch (e) {
        // no-op
      }
    },
  };
}

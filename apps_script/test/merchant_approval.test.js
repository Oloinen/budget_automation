/**
 * Tests for merchant_approval.js
 */

const { normaliseForMatch } = require("../src/utils");

// Status/tab constants (defined locally to avoid config.local.js dependency)
const STATUS_NEEDS_REVIEW = "NEEDS_REVIEW";
const STATUS_NEEDS_RULE = "NEEDS_RULE";
const STATUS_APPROVED = "APPROVED";
const STATUS_ERROR = "ERROR";
const TAB_CC_STAGING = "credit_card_staging";
const TAB_TRANSACTIONS_READY = "transactions_ready";
const TAB_CATEGORIES = "categories";
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
const HEADERS_CATEGORIES = ["group", "category", "subcategory", "active"];

// Test-friendly toIso (utils.js version uses Apps Script Utilities)
function toIso(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "";
  return d.toISOString().replace("Z", "").slice(0, -4);
}

function toMonth(yyyyMmDd) {
  return String(yyyyMmDd || "").slice(0, 7);
}

// Mock sheet factory
function createMockSheet(name, headers) {
  return {
    _name: name,
    _data: [],
    appendRow(row) {
      this._data.push([...row]);
    },
    getDataRange() {
      return {
        getValues: () => [headers, ...this._data],
      };
    },
    getRange(row, col, _numRows, _numCols) {
      const sheet = this;
      return {
        getValues: () => [headers],
        setValues: () => {},
        setValue: (val) => {
          // row is 1-based, col is 1-based
          const dataRowIdx = row - 2; // -1 for header, -1 for 0-based
          if (dataRowIdx >= 0 && dataRowIdx < sheet._data.length) {
            sheet._data[dataRowIdx][col - 1] = val;
          }
        },
      };
    },
    setFrozenRows() {},
  };
}

// Create mock spreadsheet
let mockSpreadsheet;
let stagingSheet;
let readySheet;
let categoriesSheet;

function setupMocks() {
  stagingSheet = createMockSheet(TAB_CC_STAGING, HEADERS_CC_STAGING);
  readySheet = createMockSheet(TAB_TRANSACTIONS_READY, HEADERS_TRANSACTIONS_READY);
  categoriesSheet = createMockSheet(TAB_CATEGORIES, HEADERS_CATEGORIES);

  mockSpreadsheet = {
    getSheetByName(name) {
      if (name === TAB_CC_STAGING) return stagingSheet;
      if (name === TAB_TRANSACTIONS_READY) return readySheet;
      if (name === TAB_CATEGORIES) return categoriesSheet;
      return null;
    },
  };
}

// Load the approval script as a module by creating functions
const fs = require("fs");
const path = require("path");
const approvalCode = fs.readFileSync(
  path.join(__dirname, "../src/credit_card/merchant_approval.js"),
  "utf8",
);

let approveMerchantStagingEntries;
let loadValidCategories;

function loadFunctions() {
  const fn = new Function(
    "SpreadsheetApp",
    "normaliseForMatch",
    "toIso",
    "toMonth",
    "STATUS_NEEDS_REVIEW",
    "STATUS_NEEDS_RULE",
    "STATUS_APPROVED",
    "STATUS_ERROR",
    "TAB_CC_STAGING",
    "TAB_TRANSACTIONS_READY",
    "TAB_CATEGORIES",
    "console",
    "Logger",
    approvalCode + "\nreturn { approveMerchantStagingEntries, loadValidCategories };",
  );

  return fn(
    { getActive: () => mockSpreadsheet },
    normaliseForMatch,
    toIso,
    toMonth,
    STATUS_NEEDS_REVIEW,
    STATUS_NEEDS_RULE,
    STATUS_APPROVED,
    STATUS_ERROR,
    TAB_CC_STAGING,
    TAB_TRANSACTIONS_READY,
    TAB_CATEGORIES,
    console,
    { log: () => {} }, // Logger mock
  );
}

beforeEach(() => {
  setupMocks();
  const funcs = loadFunctions();
  approveMerchantStagingEntries = funcs.approveMerchantStagingEntries;
  loadValidCategories = funcs.loadValidCategories;

  // Add some default categories
  categoriesSheet.appendRow(["Food", "Groceries", "", true]);
  categoriesSheet.appendRow(["Transport", "Gas", "", true]);
  categoriesSheet.appendRow(["Inactive", "Old", "", false]);
});

describe("loadValidCategories", () => {
  test("loads active categories only", () => {
    const validCats = loadValidCategories(categoriesSheet);

    expect(validCats.size).toBe(2);
    expect(validCats.has("food|groceries")).toBe(true);
    expect(validCats.has("transport|gas")).toBe(true);
    expect(validCats.has("inactive|old")).toBe(false);
  });

  test("normalizes keys but preserves canonical names", () => {
    const validCats = loadValidCategories(categoriesSheet);

    const foodEntry = validCats.get("food|groceries");
    expect(foodEntry.group).toBe("Food");
    expect(foodEntry.category).toBe("Groceries");
  });
});

describe("approveMerchantStagingEntries", () => {
  test("approves valid manually categorized entry", () => {
    stagingSheet.appendRow([
      "tx-001", // tx_id
      "2026-01-05", // date
      "Grocery Store", // merchant
      50.0, // amount
      "unknown", // rule_mode
      "Food", // group (manually filled)
      "Groceries", // category (manually filled)
      "", // posted_at
      STATUS_NEEDS_RULE, // status
    ]);

    approveMerchantStagingEntries();

    // Check transactions_ready has new entry
    expect(readySheet._data.length).toBe(1);
    expect(readySheet._data[0][0]).toBe("tx-001");
    expect(readySheet._data[0][5]).toBe("Food");
    expect(readySheet._data[0][6]).toBe("Groceries");
    expect(readySheet._data[0][8]).toBe("credit_card");

    // Check staging row updated
    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_APPROVED); // status
    expect(stagingData[1][7]).not.toBe(""); // posted_at filled
  });

  test("sets error status for invalid category", () => {
    stagingSheet.appendRow([
      "tx-002",
      "2026-01-05",
      "Mystery Store",
      100.0,
      "unknown",
      "InvalidGroup", // does not exist in categories
      "InvalidCategory",
      "",
      STATUS_NEEDS_REVIEW,
    ]);

    approveMerchantStagingEntries();

    // No entry in transactions_ready
    expect(readySheet._data.length).toBe(0);

    // Staging row has ERROR status
    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_ERROR);
  });

  test("skips entries without group or category", () => {
    stagingSheet.appendRow([
      "tx-003",
      "2026-01-05",
      "Store",
      50.0,
      "unknown",
      "", // no group
      "", // no category
      "",
      STATUS_NEEDS_RULE,
    ]);

    approveMerchantStagingEntries();

    // No entry in transactions_ready
    expect(readySheet._data.length).toBe(0);

    // Status unchanged
    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_NEEDS_RULE);
  });

  test("skips already approved entries", () => {
    stagingSheet.appendRow([
      "tx-004",
      "2026-01-05",
      "Store",
      30.0,
      "review",
      "Food",
      "Groceries",
      "2026-01-04T10:00:00",
      STATUS_APPROVED, // already approved
    ]);

    approveMerchantStagingEntries();

    // No new entry in transactions_ready (already processed)
    expect(readySheet._data.length).toBe(0);
  });

  test("matches normalized category names (case insensitive)", () => {
    stagingSheet.appendRow([
      "tx-005",
      "2026-01-05",
      "Gas Station",
      45.0,
      "unknown",
      "TRANSPORT", // uppercase
      "GAS", // uppercase
      "",
      STATUS_NEEDS_REVIEW,
    ]);

    approveMerchantStagingEntries();

    // Entry approved with canonical names
    expect(readySheet._data.length).toBe(1);
    expect(readySheet._data[0][5]).toBe("Transport"); // canonical group
    expect(readySheet._data[0][6]).toBe("Gas"); // canonical category

    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_APPROVED);
  });

  test("processes multiple entries in single run", () => {
    // Valid entry
    stagingSheet.appendRow([
      "tx-006",
      "2026-01-05",
      "Store1",
      10,
      "unknown",
      "Food",
      "Groceries",
      "",
      STATUS_NEEDS_RULE,
    ]);
    // Another valid entry
    stagingSheet.appendRow([
      "tx-007",
      "2026-01-06",
      "Store2",
      20,
      "review",
      "Transport",
      "Gas",
      "",
      STATUS_NEEDS_REVIEW,
    ]);
    // Invalid entry
    stagingSheet.appendRow([
      "tx-008",
      "2026-01-07",
      "Store3",
      30,
      "unknown",
      "Bad",
      "Category",
      "",
      STATUS_NEEDS_RULE,
    ]);

    approveMerchantStagingEntries();

    // Two valid entries in transactions_ready
    expect(readySheet._data.length).toBe(2);

    // Check statuses
    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_APPROVED);
    expect(stagingData[2][8]).toBe(STATUS_APPROVED);
    expect(stagingData[3][8]).toBe(STATUS_ERROR);
  });

  test("extracts month from date correctly", () => {
    stagingSheet.appendRow([
      "tx-009",
      "2026-03-15",
      "Store",
      40,
      "unknown",
      "Food",
      "Groceries",
      "",
      STATUS_NEEDS_RULE,
    ]);

    approveMerchantStagingEntries();

    expect(readySheet._data[0][2]).toBe("2026-03"); // month column
  });
});

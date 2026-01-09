/**
 * Tests for unknown_merchants_approval.js
 */


// Status/tab/mode constants (defined locally to avoid config.local.js dependency)
const STATUS_NEEDS_REVIEW = "NEEDS_REVIEW";
const STATUS_APPROVED = "APPROVED";
const STATUS_ERROR = "ERROR";
const MODE_AUTO = "auto";
const MODE_REVIEW = "review";
const MODE_SKIP = "skip";
const TAB_MERCHANTS_UNKNOWN = "unknown_merchants";
const TAB_MERCHANT_RULES = "merchant_rules";
const TAB_CATEGORIES = "categories";
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
const HEADERS_CATEGORIES = ["group", "category", "subcategory", "active"];

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
let unknownSheet;
let rulesSheet;
let categoriesSheet;

function setupMocks() {
  unknownSheet = createMockSheet(TAB_MERCHANTS_UNKNOWN, HEADERS_UNKNOWN_MERCHANTS);
  rulesSheet = createMockSheet(TAB_MERCHANT_RULES, HEADERS_MERCHANT_RULES);
  categoriesSheet = createMockSheet(TAB_CATEGORIES, HEADERS_CATEGORIES);

  mockSpreadsheet = {
    getSheetByName(name) {
      if (name === TAB_MERCHANTS_UNKNOWN) return unknownSheet;
      if (name === TAB_MERCHANT_RULES) return rulesSheet;
      if (name === TAB_CATEGORIES) return categoriesSheet;
      return null;
    },
  };
}

// Load the approval script as a module by creating functions
const fs = require("fs");
const path = require("path");
const approvalCode = fs.readFileSync(
  path.join(__dirname, "../../../src/workflows/credit-card/unknown_merchants_approval.js"),
  "utf8",
);

let approveUnknownMerchants;
let loadValidCategoriesForUnknown;
let loadExistingMerchants;

// Test-friendly toIso (utils.js version uses Apps Script Utilities)
function toIso(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "";
  return d.toISOString().replace("Z", "").slice(0, -4);
}

function loadFunctions() {
  const fn = new Function(
    "require",
    "SpreadsheetApp",
    "STATUS_NEEDS_REVIEW",
    "STATUS_APPROVED",
    "STATUS_ERROR",
    "MODE_AUTO",
    "MODE_REVIEW",
    "MODE_SKIP",
    "TAB_MERCHANTS_UNKNOWN",
    "TAB_MERCHANT_RULES",
    "TAB_CATEGORIES",
    "console",
    "Logger",
    approvalCode +
      "\nreturn { approveUnknownMerchants, loadValidCategoriesForUnknown, loadExistingMerchants };",
  );

  const mockRequire = (modulePath) => {
    if (modulePath.includes("error_handler")) {
      return require("../../../src/core/error_handler");
    }
    if (modulePath.includes("errors")) {
      return require("../../../src/core/errors");
    }
    if (modulePath.includes("notification_utils")) {
      return { notifyImportFailure: () => {} };
    }
    if (modulePath.includes('parsers/data')) {
      return require('../../../src/core/parsers/data');
    }
    if (modulePath.includes('utilities')) {
      return require('../../../src/core/utilities');
    }
    throw new Error(`Module not mocked: ${modulePath}`);
  };

  return fn(
    mockRequire,
    { getActive: () => mockSpreadsheet },
    STATUS_NEEDS_REVIEW,
    STATUS_APPROVED,
    STATUS_ERROR,
    MODE_AUTO,
    MODE_REVIEW,
    MODE_SKIP,
    TAB_MERCHANTS_UNKNOWN,
    TAB_MERCHANT_RULES,
    TAB_CATEGORIES,
    { log: () => {} }, // silent console
    { log: () => {} }, // Logger mock
  );
}

beforeEach(() => {
  setupMocks();
  const funcs = loadFunctions();
  approveUnknownMerchants = funcs.approveUnknownMerchants;
  loadValidCategoriesForUnknown = funcs.loadValidCategoriesForUnknown;
  loadExistingMerchants = funcs.loadExistingMerchants;
});

describe("loadValidCategoriesForUnknown", () => {
  test("loads active categories into normalized map", () => {
    categoriesSheet.appendRow(["Food", "Groceries", "", true]);
    categoriesSheet.appendRow(["Transport", "Gas", "", true]);
    categoriesSheet.appendRow(["Entertainment", "Movies", "", false]); // inactive

    const validMap = loadValidCategoriesForUnknown(categoriesSheet);

    expect(validMap.size).toBe(2);
    expect(validMap.has("food|groceries")).toBe(true);
    expect(validMap.has("transport|gas")).toBe(true);
    expect(validMap.has("entertainment|movies")).toBe(false);
  });

  test("preserves canonical names", () => {
    categoriesSheet.appendRow(["Food", "Groceries", "", true]);

    const validMap = loadValidCategoriesForUnknown(categoriesSheet);
    const entry = validMap.get("food|groceries");

    expect(entry.group).toBe("Food");
    expect(entry.category).toBe("Groceries");
  });
});

describe("loadExistingMerchants", () => {
  test("loads existing merchant rules into normalized set", () => {
    rulesSheet.appendRow(["Amazon", "Shopping", "Online", MODE_AUTO]);
    rulesSheet.appendRow(["Walmart", "Food", "Groceries", MODE_AUTO]);

    const existing = loadExistingMerchants(rulesSheet);

    expect(existing.size).toBe(2);
    expect(existing.has("amazon")).toBe(true);
    expect(existing.has("walmart")).toBe(true);
  });
});

describe("approveUnknownMerchants", () => {
  beforeEach(() => {
    // Add default categories
    categoriesSheet.appendRow(["Food", "Groceries", "", true]);
    categoriesSheet.appendRow(["Transport", "Gas", "", true]);
  });

  test("creates rule for valid unknown merchant", () => {
    unknownSheet.appendRow([
      "Grocery Store", // merchant
      "Food", // group (manually filled)
      "Groceries", // category (manually filled)
      MODE_AUTO, // mode (manually filled)
      5, // count
      "2026-01-01", // first_seen
      "2026-01-05", // last_seen
      STATUS_NEEDS_REVIEW, // status
    ]);

    approveUnknownMerchants();

    // Check merchant_rules has new entry
    expect(rulesSheet._data.length).toBe(1);
    expect(rulesSheet._data[0][0]).toBe("Grocery Store");
    expect(rulesSheet._data[0][1]).toBe("Food");
    expect(rulesSheet._data[0][2]).toBe("Groceries");
    expect(rulesSheet._data[0][3]).toBe(MODE_AUTO);

    // Check unknown_merchants row updated
    const unknownData = unknownSheet.getDataRange().getValues();
    expect(unknownData[1][7]).toBe(STATUS_APPROVED);
  });

  test("validates category against categories sheet", () => {
    unknownSheet.appendRow([
      "Mystery Store",
      "InvalidGroup",
      "InvalidCategory",
      MODE_AUTO,
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownMerchants();

    // No rule created
    expect(rulesSheet._data.length).toBe(0);

    // Status set to ERROR
    const unknownData = unknownSheet.getDataRange().getValues();
    expect(unknownData[1][7]).toBe(STATUS_ERROR);
  });

  test("prevents duplicate merchant rules", () => {
    // Add existing rule
    rulesSheet.appendRow(["Grocery Store", "Food", "Groceries", MODE_AUTO]);

    // Try to add same merchant again
    unknownSheet.appendRow([
      "Grocery Store",
      "Food",
      "Groceries",
      MODE_AUTO,
      2,
      "2026-01-06",
      "2026-01-06",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownMerchants();

    // No new rule created
    expect(rulesSheet._data.length).toBe(1);

    // Status set to ERROR
    const unknownData = unknownSheet.getDataRange().getValues();
    expect(unknownData[1][7]).toBe(STATUS_ERROR);
  });

  test("validates mode field", () => {
    unknownSheet.appendRow([
      "Test Store",
      "Food",
      "Groceries",
      "invalid_mode", // invalid mode
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownMerchants();

    // No rule created
    expect(rulesSheet._data.length).toBe(0);

    // Status set to ERROR
    const unknownData = unknownSheet.getDataRange().getValues();
    expect(unknownData[1][7]).toBe(STATUS_ERROR);
  });

  test("skips entries missing required fields", () => {
    unknownSheet.appendRow([
      "Incomplete Store",
      "", // no group
      "Groceries",
      MODE_AUTO,
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownMerchants();

    // No rule created
    expect(rulesSheet._data.length).toBe(0);

    // Status set to ERROR (because group/category required for auto mode)
    const unknownData = unknownSheet.getDataRange().getValues();
    expect(unknownData[1][7]).toBe(STATUS_ERROR);
  });

  test("allows skip mode without category validation", () => {
    unknownSheet.appendRow([
      "ATM Withdrawal",
      "", // empty group (skip doesn't need valid category)
      "", // empty category
      MODE_SKIP, // skip mode must be set
      3,
      "2026-01-01",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownMerchants();

    // Rule created with skip mode
    expect(rulesSheet._data.length).toBe(1);
    expect(rulesSheet._data[0][0]).toBe("ATM Withdrawal");
    expect(rulesSheet._data[0][3]).toBe(MODE_SKIP);

    // Status updated to APPROVED
    const unknownData = unknownSheet.getDataRange().getValues();
    expect(unknownData[1][7]).toBe(STATUS_APPROVED);
  });

  test("uses canonical names from categories sheet", () => {
    unknownSheet.appendRow([
      "Gas Station",
      "TRANSPORT", // uppercase - should get canonical
      "GAS", // uppercase - should get canonical
      MODE_AUTO,
      2,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownMerchants();

    // Rule created with canonical names
    expect(rulesSheet._data.length).toBe(1);
    expect(rulesSheet._data[0][1]).toBe("Transport"); // canonical
    expect(rulesSheet._data[0][2]).toBe("Gas"); // canonical
  });

  test("processes multiple merchants in single run", () => {
    // Valid merchant
    unknownSheet.appendRow([
      "Store1",
      "Food",
      "Groceries",
      MODE_AUTO,
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);
    // Another valid merchant
    unknownSheet.appendRow([
      "Store2",
      "Transport",
      "Gas",
      MODE_REVIEW,
      2,
      "2026-01-05",
      "2026-01-06",
      STATUS_NEEDS_REVIEW,
    ]);
    // Invalid merchant
    unknownSheet.appendRow([
      "Store3",
      "Bad",
      "Category",
      MODE_AUTO,
      1,
      "2026-01-07",
      "2026-01-07",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownMerchants();

    // Two rules created
    expect(rulesSheet._data.length).toBe(2);

    // Check statuses
    const unknownData = unknownSheet.getDataRange().getValues();
    expect(unknownData[1][7]).toBe(STATUS_APPROVED);
    expect(unknownData[2][7]).toBe(STATUS_APPROVED);
    expect(unknownData[3][7]).toBe(STATUS_ERROR);
  });

  test("skips already approved entries", () => {
    unknownSheet.appendRow([
      "Already Processed",
      "Food",
      "Groceries",
      MODE_AUTO,
      5,
      "2026-01-01",
      "2026-01-05",
      STATUS_APPROVED, // already approved
    ]);

    approveUnknownMerchants();

    // No new rule created
    expect(rulesSheet._data.length).toBe(0);
  });
});

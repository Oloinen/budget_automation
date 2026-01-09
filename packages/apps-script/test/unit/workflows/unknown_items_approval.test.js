/**
 * Tests for unknown_items_approval.js
 */


// Status/tab/mode constants (defined locally to avoid config.local.js dependency)
const STATUS_NEEDS_REVIEW = "NEEDS_REVIEW";
const STATUS_APPROVED = "APPROVED";
const STATUS_ERROR = "ERROR";
const MODE_AUTO = "auto";
const MODE_REVIEW = "review";
const MODE_SKIP = "skip";
const TAB_UNKNOWN_ITEMS = "unknown_items";
const TAB_ITEM_RULES = "item_rules";
const TAB_CATEGORIES = "categories";
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
const HEADERS_ITEM_RULES = ["pattern", "group", "category", "mode"];
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
  unknownSheet = createMockSheet(TAB_UNKNOWN_ITEMS, HEADERS_UNKNOWN_ITEMS);
  rulesSheet = createMockSheet(TAB_ITEM_RULES, HEADERS_ITEM_RULES);
  categoriesSheet = createMockSheet(TAB_CATEGORIES, HEADERS_CATEGORIES);

  mockSpreadsheet = {
    getSheetByName(name) {
      if (name === TAB_UNKNOWN_ITEMS) return unknownSheet;
      if (name === TAB_ITEM_RULES) return rulesSheet;
      if (name === TAB_CATEGORIES) return categoriesSheet;
      return null;
    },
  };
}

// Load the approval script as a module by creating functions
const fs = require("fs");
const path = require("path");
const approvalCode = fs.readFileSync(
  path.join(__dirname, "../../../src/workflows/receipts/unknown_items_approval.js"),
  "utf8",
);

let approveUnknownItems;
let loadValidCategoriesForUnknown;
let loadExistingPatterns;

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
    "TAB_UNKNOWN_ITEMS",
    "TAB_ITEM_RULES",
    "TAB_CATEGORIES",
    "console",
    "Logger",
    approvalCode +
      "\nreturn { approveUnknownItems, loadValidCategoriesForUnknown, loadExistingPatterns };",
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
    TAB_UNKNOWN_ITEMS,
    TAB_ITEM_RULES,
    TAB_CATEGORIES,
    { log: () => {} }, // silent console
    { log: () => {} }, // Logger mock
  );
}

beforeEach(() => {
  setupMocks();
  const funcs = loadFunctions();
  approveUnknownItems = funcs.approveUnknownItems;
  loadValidCategoriesForUnknown = funcs.loadValidCategoriesForUnknown;
  loadExistingPatterns = funcs.loadExistingPatterns;
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

  test("returns empty map for empty sheet", () => {
    const validMap = loadValidCategoriesForUnknown(categoriesSheet);
    expect(validMap.size).toBe(0);
  });
});

describe("loadExistingPatterns", () => {
  test("loads patterns from rules sheet", () => {
    rulesSheet.appendRow(["milk", "Food", "Groceries", "auto"]);
    rulesSheet.appendRow(["Coffee", "Food", "Dining", "review"]);

    const patterns = loadExistingPatterns(rulesSheet);

    expect(patterns.size).toBe(2);
    expect(patterns.has("milk")).toBe(true);
    expect(patterns.has("coffee")).toBe(true);
  });

  test("returns empty set for empty sheet", () => {
    const patterns = loadExistingPatterns(rulesSheet);
    expect(patterns.size).toBe(0);
  });
});

describe("approveUnknownItems", () => {
  beforeEach(() => {
    // Add valid categories
    categoriesSheet.appendRow(["Food", "Groceries", "", true]);
    categoriesSheet.appendRow(["Transport", "Gas", "", true]);
  });

  test("creates rule and approves entry with valid group, category, and mode", () => {
    // Add unknown item with manual categorization
    unknownSheet.appendRow([
      "milk", // pattern
      "Food", // group (manually filled)
      "Groceries", // category (manually filled)
      "auto", // mode (manually filled)
      5, // count
      "2026-01-01", // first_seen
      "2026-01-05", // last_seen
      STATUS_NEEDS_REVIEW, // status
    ]);

    approveUnknownItems();

    // Check item_rules has new entry
    expect(rulesSheet._data.length).toBe(1);
    expect(rulesSheet._data[0][0]).toBe("milk");
    expect(rulesSheet._data[0][1]).toBe("Food");
    expect(rulesSheet._data[0][2]).toBe("Groceries");
    expect(rulesSheet._data[0][3]).toBe("auto");

    // Check unknown_items row updated
    expect(unknownSheet._data[0][7]).toBe(STATUS_APPROVED);
  });

  test("sets error status for invalid category", () => {
    unknownSheet.appendRow([
      "mystery item",
      "InvalidGroup",
      "InvalidCategory",
      "auto",
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownItems();

    // No entry in item_rules
    expect(rulesSheet._data.length).toBe(0);

    // Unknown item has ERROR status
    expect(unknownSheet._data[0][7]).toBe(STATUS_ERROR);
  });

  test("sets error status for invalid mode", () => {
    unknownSheet.appendRow([
      "bread",
      "Food",
      "Groceries",
      "invalid_mode", // not auto/review/skip
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownItems();

    // No entry in item_rules
    expect(rulesSheet._data.length).toBe(0);

    // Unknown item has ERROR status
    expect(unknownSheet._data[0][7]).toBe(STATUS_ERROR);
  });

  test("skips entries without group, category, or mode", () => {
    unknownSheet.appendRow([
      "uncategorized item",
      "", // no group
      "", // no category
      "", // no mode
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownItems();

    // No entry in item_rules
    expect(rulesSheet._data.length).toBe(0);

    // Status unchanged
    expect(unknownSheet._data[0][7]).toBe(STATUS_NEEDS_REVIEW);
  });

  test("skips already approved entries", () => {
    unknownSheet.appendRow([
      "already done",
      "Food",
      "Groceries",
      "auto",
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_APPROVED, // already approved
    ]);

    approveUnknownItems();

    // No new entry in item_rules (already processed)
    expect(rulesSheet._data.length).toBe(0);
  });

  test("marks as approved if pattern already exists in rules", () => {
    // Pre-existing rule
    rulesSheet.appendRow(["milk", "Food", "Groceries", "auto"]);

    unknownSheet.appendRow([
      "milk", // same pattern as existing rule
      "Food",
      "Groceries",
      "auto",
      3,
      "2026-01-01",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownItems();

    // No duplicate rule added
    expect(rulesSheet._data.length).toBe(1);

    // But unknown item is marked approved
    expect(unknownSheet._data[0][7]).toBe(STATUS_APPROVED);
  });

  test("uses canonical category names from categories sheet", () => {
    unknownSheet.appendRow([
      "butter",
      "FOOD", // uppercase
      "GROCERIES", // uppercase
      "review",
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownItems();

    // Rule created with canonical names
    expect(rulesSheet._data.length).toBe(1);
    expect(rulesSheet._data[0][1]).toBe("Food"); // canonical
    expect(rulesSheet._data[0][2]).toBe("Groceries"); // canonical

    expect(unknownSheet._data[0][7]).toBe(STATUS_APPROVED);
  });

  test("processes multiple entries in single run", () => {
    // Valid entry with auto mode
    unknownSheet.appendRow([
      "eggs",
      "Food",
      "Groceries",
      "auto",
      2,
      "2026-01-01",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);
    // Valid entry with review mode
    unknownSheet.appendRow([
      "premium cheese",
      "Food",
      "Groceries",
      "review",
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);
    // Invalid entry
    unknownSheet.appendRow([
      "unknown",
      "Bad",
      "Category",
      "auto",
      1,
      "2026-01-05",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownItems();

    // Two valid rules created
    expect(rulesSheet._data.length).toBe(2);

    // Check statuses
    expect(unknownSheet._data[0][7]).toBe(STATUS_APPROVED);
    expect(unknownSheet._data[1][7]).toBe(STATUS_APPROVED);
    expect(unknownSheet._data[2][7]).toBe(STATUS_ERROR);
  });

  test("accepts skip mode", () => {
    unknownSheet.appendRow([
      "plastic bag",
      "Food",
      "Groceries",
      "skip", // skip mode
      10,
      "2026-01-01",
      "2026-01-05",
      STATUS_NEEDS_REVIEW,
    ]);

    approveUnknownItems();

    // Rule created with skip mode
    expect(rulesSheet._data.length).toBe(1);
    expect(rulesSheet._data[0][3]).toBe("skip");

    expect(unknownSheet._data[0][7]).toBe(STATUS_APPROVED);
  });
});

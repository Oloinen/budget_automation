/**
 * Tests for receipt_approval.js
 */

const { normaliseForMatch } = require('../src/utils');

// Status/tab constants (defined locally to avoid config.local.js dependency)
const STATUS_NEEDS_REVIEW = "NEEDS_REVIEW";
const STATUS_NEEDS_RULE = "NEEDS_RULE";
const STATUS_APPROVED = "APPROVED";
const STATUS_ERROR = "ERROR";
const TAB_RECEIPT_STAGING = "receipt_staging";
const TAB_TRANSACTIONS_READY = "transactions_ready";
const TAB_CATEGORIES = "categories";
const HEADERS_RECEIPT_STAGING = ["tx_id","date","receipt_id","merchant","amount","group","category","posted_at","status","raw_ocr"];
const HEADERS_TRANSACTIONS_READY = ["tx_id","date","month","merchant","amount","group","category","posted_at","source"];
const HEADERS_CATEGORIES = ["group","category","subcategory","active"];

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
    appendRow(row) { this._data.push([...row]); },
    getDataRange() {
      return {
        getValues: () => [headers, ...this._data]
      };
    },
    getRange(row, col, numRows, numCols) {
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
        }
      };
    },
    setFrozenRows() {}
  };
}

// Create mock spreadsheet
let mockSpreadsheet;
let stagingSheet;
let readySheet;
let categoriesSheet;

function setupMocks() {
  stagingSheet = createMockSheet(TAB_RECEIPT_STAGING, HEADERS_RECEIPT_STAGING);
  readySheet = createMockSheet(TAB_TRANSACTIONS_READY, HEADERS_TRANSACTIONS_READY);
  categoriesSheet = createMockSheet(TAB_CATEGORIES, HEADERS_CATEGORIES);
  
  mockSpreadsheet = {
    getSheetByName(name) {
      if (name === TAB_RECEIPT_STAGING) return stagingSheet;
      if (name === TAB_TRANSACTIONS_READY) return readySheet;
      if (name === TAB_CATEGORIES) return categoriesSheet;
      return null;
    }
  };
}

// Load the approval script as a module by creating functions
const fs = require('fs');
const path = require('path');
const approvalCode = fs.readFileSync(
  path.join(__dirname, '../src/receipts/item_approval.js'), 
  'utf8'
);

let approveItemStagingEntries;
let loadValidCategories;

function loadFunctions() {
  const fn = new Function(
    'SpreadsheetApp', 'normaliseForMatch', 'toIso', 'toMonth',
    'STATUS_NEEDS_REVIEW', 'STATUS_NEEDS_RULE', 'STATUS_APPROVED', 'STATUS_ERROR',
    'TAB_RECEIPT_STAGING', 'TAB_TRANSACTIONS_READY', 'TAB_CATEGORIES',
    'console',
    approvalCode + '\nreturn { approveItemStagingEntries, loadValidCategories };'
  );
  
  return fn(
    { getActive: () => mockSpreadsheet },
    normaliseForMatch, toIso, toMonth,
    STATUS_NEEDS_REVIEW, STATUS_NEEDS_RULE, STATUS_APPROVED, STATUS_ERROR,
    TAB_RECEIPT_STAGING, TAB_TRANSACTIONS_READY, TAB_CATEGORIES,
    { log: () => {} } // silent console
  );
}

beforeEach(() => {
  setupMocks();
  const funcs = loadFunctions();
  approveItemStagingEntries = funcs.approveItemStagingEntries;
  loadValidCategories = funcs.loadValidCategories;
});

describe('loadValidCategories', () => {
  test('loads active categories into normalized map', () => {
    categoriesSheet.appendRow(["Food", "Groceries", "", true]);
    categoriesSheet.appendRow(["Transport", "Gas", "", true]);
    categoriesSheet.appendRow(["Entertainment", "Movies", "", false]); // inactive
    
    const validMap = loadValidCategories(categoriesSheet);
    
    expect(validMap.size).toBe(2);
    expect(validMap.has("food|groceries")).toBe(true);
    expect(validMap.has("transport|gas")).toBe(true);
    expect(validMap.has("entertainment|movies")).toBe(false);
  });
  
  test('normalizes to lowercase with spaces', () => {
    categoriesSheet.appendRow(["Café", "Café Latte", "", true]);
    
    const validMap = loadValidCategories(categoriesSheet);
    
    expect(validMap.has("café|café latte")).toBe(true);
    expect(validMap.get("café|café latte")).toEqual({ group: "Café", category: "Café Latte" });
  });
  
  test('returns empty map for empty sheet', () => {
    const validMap = loadValidCategories(categoriesSheet);
    expect(validMap.size).toBe(0);
  });
  
  test('preserves canonical names', () => {
    categoriesSheet.appendRow(["Food & Drinks", "Groceries (Weekly)", "", true]);
    
    const validMap = loadValidCategories(categoriesSheet);
    const canonical = validMap.get("food & drinks|groceries (weekly)");
    
    expect(canonical.group).toBe("Food & Drinks");
    expect(canonical.category).toBe("Groceries (Weekly)");
  });
});

describe('approveItemStagingEntries', () => {
  beforeEach(() => {
    // Add valid categories
    categoriesSheet.appendRow(["Food", "Groceries", "", true]);
    categoriesSheet.appendRow(["Transport", "Gas", "", true]);
  });
  
  test('approves entry with valid group and category', () => {
    // Add staging entry with manual categorization
    stagingSheet.appendRow([
      "tx-001",           // tx_id
      "2026-01-05",       // date
      "r_file123",        // receipt_id
      "K-Market",         // merchant
      25.50,              // amount
      "Food",             // group (manually filled)
      "Groceries",        // category (manually filled)
      "",                 // posted_at
      STATUS_NEEDS_RULE,  // status
      "raw ocr text"      // raw_ocr
    ]);

    approveItemStagingEntries();

    // Check transactions_readyhas new entry
    expect(readySheet._data.length).toBe(1);
    expect(readySheet._data[0][0]).toBe("tx-001");
    expect(readySheet._data[0][5]).toBe("Food");
    expect(readySheet._data[0][6]).toBe("Groceries");
    expect(readySheet._data[0][8]).toBe("receipt:r_file123");
    
    // Check staging row updated
    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_APPROVED); // status
    expect(stagingData[1][7]).not.toBe(""); // posted_at filled
  });
  
  test('sets error status for invalid category', () => {
    stagingSheet.appendRow([
      "tx-002",
      "2026-01-05",
      "r_file456",
      "Mystery Store",
      100.00,
      "InvalidGroup",     // does not exist in categories
      "InvalidCategory",
      "",
      STATUS_NEEDS_REVIEW,
      ""
    ]);
    
    approveItemStagingEntries();
    
    // No entry in transactions_ready
    expect(readySheet._data.length).toBe(0);
    
    // Staging row has ERROR status
    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_ERROR);
  });
  
  test('skips entries without group or category', () => {
    stagingSheet.appendRow([
      "tx-003",
      "2026-01-05",
      "r_file789",
      "Store",
      50.00,
      "",                 // no group
      "",                 // no category
      "",
      STATUS_NEEDS_RULE,
      ""
    ]);
    
    approveItemStagingEntries();
    
    // No entry in transactions_ready
    expect(readySheet._data.length).toBe(0);
    
    // Status unchanged
    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_NEEDS_RULE);
  });
  
  test('skips already approved entries', () => {
    stagingSheet.appendRow([
      "tx-004",
      "2026-01-05",
      "r_fileabc",
      "Store",
      30.00,
      "Food",
      "Groceries",
      "2026-01-04T10:00:00",
      STATUS_APPROVED,    // already approved
      ""
    ]);
    
    approveItemStagingEntries();
    
    // No new entry in transactions_ready (already processed)
    expect(readySheet._data.length).toBe(0);
  });
  
  test('matches normalized category names (case insensitive)', () => {
    // Add category with mixed case
    categoriesSheet.appendRow(["Food", "Groceries", "", true]);
    
    stagingSheet.appendRow([
      "tx-005",
      "2026-01-05",
      "r_filecafe",
      "Coffee Shop",
      5.00,
      "FOOD",             // uppercase
      "GROCERIES",        // uppercase
      "",
      STATUS_NEEDS_REVIEW,
      ""
    ]);
    
    approveItemStagingEntries();
    
    // Entry approved with canonical names
    expect(readySheet._data.length).toBe(1);
    expect(readySheet._data[0][5]).toBe("Food");       // canonical group
    expect(readySheet._data[0][6]).toBe("Groceries");  // canonical category
    
    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_APPROVED);
  });
  
  test('processes multiple entries in single run', () => {
    // Valid entry
    stagingSheet.appendRow([
      "tx-006", "2026-01-05", "r_f1", "Store1", 10, "Food", "Groceries", "", STATUS_NEEDS_RULE, ""
    ]);
    // Another valid entry
    stagingSheet.appendRow([
      "tx-007", "2026-01-06", "r_f2", "Store2", 20, "Transport", "Gas", "", STATUS_NEEDS_REVIEW, ""
    ]);
    // Invalid entry
    stagingSheet.appendRow([
      "tx-008", "2026-01-07", "r_f3", "Store3", 30, "Bad", "Category", "", STATUS_NEEDS_RULE, ""
    ]);
    
    approveItemStagingEntries();
    
    // Two valid entries in transactions_ready
    expect(readySheet._data.length).toBe(2);
    
    // Check statuses
    const stagingData = stagingSheet.getDataRange().getValues();
    expect(stagingData[1][8]).toBe(STATUS_APPROVED);
    expect(stagingData[2][8]).toBe(STATUS_APPROVED);
    expect(stagingData[3][8]).toBe(STATUS_ERROR);
  });
  
  test('extracts month from date correctly', () => {
    stagingSheet.appendRow([
      "tx-009", "2026-03-15", "r_f4", "Store", 40, "Food", "Groceries", "", STATUS_NEEDS_RULE, ""
    ]);
    
    approveItemStagingEntries();
    
    expect(readySheet._data[0][2]).toBe("2026-03"); // month column
  });
});

const { loadUnknownsIndex, upsertUnknown, flushUnknowns } = require("../../src/unknowns_utils");

// Define status constants locally to avoid config.js dependencies
const STATUS_NEEDS_REVIEW = "NEEDS_REVIEW";
const STATUS_APPROVED = "APPROVED";

// Mock sheet utilities
let mockNormaliseForMatch;
let mockSetIfExists;
let mockAppendRows;

beforeEach(() => {
  // Reset mocks
  mockNormaliseForMatch = jest.fn((s) =>
    String(s || "")
      .toLowerCase()
      .trim(),
  );
  mockSetIfExists = jest.fn((row, colMap, colName, value) => {
    const colIdx = colMap[colName];
    if (colIdx) row[colIdx - 1] = value;
  });
  mockAppendRows = jest.fn();

  // Set globals for the module
  global.normaliseForMatch = mockNormaliseForMatch;
  global.setIfExists = mockSetIfExists;
  global.appendRows = mockAppendRows;
  global.STATUS_NEEDS_REVIEW = STATUS_NEEDS_REVIEW;
});

afterEach(() => {
  delete global.normaliseForMatch;
  delete global.setIfExists;
  delete global.appendRows;
  delete global.STATUS_NEEDS_REVIEW;
});

describe("unknowns_utils", () => {
  describe("loadUnknownsIndex", () => {
    it("loads existing rows into an index with normalization", () => {
      const mockSheet = {
        getLastRow: () => 3,
        getLastColumn: () => 8,
        getRange: jest.fn(() => ({
          getValues: () => [
            [
              "Amazon",
              "Shopping",
              "Online",
              "auto",
              5,
              "2025-01-01",
              "2025-01-05",
              STATUS_APPROVED,
            ],
            [
              "Walmart",
              "Groceries",
              "Food",
              "",
              2,
              "2025-01-03",
              "2025-01-04",
              STATUS_NEEDS_REVIEW,
            ],
          ],
        })),
      };

      const colMap = {
        merchant: 1,
        group: 2,
        category: 3,
        mode: 4,
        count: 5,
        first_seen: 6,
        last_seen: 7,
        status: 8,
      };

      const idx = loadUnknownsIndex(mockSheet, colMap, "merchant", true);

      expect(mockSheet.getRange).toHaveBeenCalledWith(2, 1, 2, 8);
      expect(idx.size).toBe(2);

      const amazon = idx.get("amazon");
      expect(amazon).toBeDefined();
      expect(amazon.merchant).toBe("Amazon");
      expect(amazon.group).toBe("Shopping");
      expect(amazon.count).toBe(5);
      expect(amazon.rowNum).toBe(2);
      expect(amazon.dirty).toBe(false);

      const walmart = idx.get("walmart");
      expect(walmart).toBeDefined();
      expect(walmart.merchant).toBe("Walmart");
      expect(walmart.count).toBe(2);
      expect(walmart.rowNum).toBe(3);
    });

    it("loads with raw keys when normalization is disabled", () => {
      const mockSheet = {
        getLastRow: () => 2,
        getLastColumn: () => 8,
        getRange: jest.fn(() => ({
          getValues: () => [
            ["Coffee Beans", "", "", "", 1, "2025-01-01", "2025-01-01", STATUS_NEEDS_REVIEW],
          ],
        })),
      };

      const colMap = {
        pattern: 1,
        group: 2,
        category: 3,
        mode: 4,
        count: 5,
        first_seen: 6,
        last_seen: 7,
        status: 8,
      };

      const idx = loadUnknownsIndex(mockSheet, colMap, "pattern", false);

      expect(idx.size).toBe(1);
      expect(idx.get("Coffee Beans")).toBeDefined();
      expect(idx.get("coffee beans")).toBeUndefined(); // no normalization
    });

    it("returns empty index when sheet has only header row", () => {
      const mockSheet = {
        getLastRow: () => 1,
        getLastColumn: () => 8,
        getRange: jest.fn(),
      };

      const colMap = { merchant: 1 };
      const idx = loadUnknownsIndex(mockSheet, colMap, "merchant", true);

      expect(idx.size).toBe(0);
      expect(mockSheet.getRange).not.toHaveBeenCalled();
    });

    it("throws error if key column is missing", () => {
      const mockSheet = { getLastRow: () => 2 };
      const colMap = { group: 2 };

      expect(() => {
        loadUnknownsIndex(mockSheet, colMap, "merchant", true);
      }).toThrow("unknowns sheet must have column: merchant");
    });

    it("skips empty rows", () => {
      const mockSheet = {
        getLastRow: () => 4,
        getLastColumn: () => 8,
        getRange: jest.fn(() => ({
          getValues: () => [
            [
              "Amazon",
              "Shopping",
              "Online",
              "auto",
              5,
              "2025-01-01",
              "2025-01-05",
              STATUS_APPROVED,
            ],
            ["", "", "", "", 0, "", "", ""], // empty row
            [
              "Walmart",
              "Groceries",
              "Food",
              "",
              2,
              "2025-01-03",
              "2025-01-04",
              STATUS_NEEDS_REVIEW,
            ],
          ],
        })),
      };

      const colMap = {
        merchant: 1,
        group: 2,
        category: 3,
        mode: 4,
        count: 5,
        first_seen: 6,
        last_seen: 7,
        status: 8,
      };
      const idx = loadUnknownsIndex(mockSheet, colMap, "merchant", true);

      expect(idx.size).toBe(2); // empty row skipped
    });
  });

  describe("upsertUnknown", () => {
    it("increments count and updates last_seen for existing entry", () => {
      const idx = new Map();
      idx.set("amazon", {
        rowNum: 2,
        merchant: "Amazon",
        group: "Shopping",
        category: "Online",
        mode: "auto",
        count: 5,
        first_seen: "2025-01-01",
        last_seen: "2025-01-05",
        status: STATUS_APPROVED,
        dirty: false,
      });

      upsertUnknown(idx, "amazon", "Amazon Prime", "merchant", "2025-01-10", STATUS_NEEDS_REVIEW);

      const entry = idx.get("amazon");
      expect(entry.count).toBe(6);
      expect(entry.last_seen).toBe("2025-01-10");
      expect(entry.first_seen).toBe("2025-01-01"); // unchanged
      expect(entry.dirty).toBe(true);
      expect(entry.merchant).toBe("Amazon"); // not updated to new raw value
    });

    it("creates new entry for unknown key", () => {
      const idx = new Map();

      upsertUnknown(idx, "walmart", "Walmart", "merchant", "2025-01-15", STATUS_NEEDS_REVIEW);

      const entry = idx.get("walmart");
      expect(entry).toBeDefined();
      expect(entry.rowNum).toBeNull();
      expect(entry.merchant).toBe("Walmart");
      expect(entry.group).toBe("");
      expect(entry.category).toBe("");
      expect(entry.mode).toBe("");
      expect(entry.count).toBe(1);
      expect(entry.first_seen).toBe("2025-01-15");
      expect(entry.last_seen).toBe("2025-01-15");
      expect(entry.status).toBe(STATUS_NEEDS_REVIEW);
      expect(entry.dirty).toBe(true);
    });

    it("sets first_seen if missing on existing entry", () => {
      const idx = new Map();
      idx.set("target", {
        rowNum: 3,
        merchant: "Target",
        group: "",
        category: "",
        mode: "",
        count: 1,
        first_seen: "", // missing
        last_seen: "2025-01-05",
        status: STATUS_NEEDS_REVIEW,
        dirty: false,
      });

      upsertUnknown(idx, "target", "Target", "merchant", "2025-01-10", STATUS_NEEDS_REVIEW);

      const entry = idx.get("target");
      expect(entry.first_seen).toBe("2025-01-10");
      expect(entry.last_seen).toBe("2025-01-10");
    });
  });

  describe("flushUnknowns", () => {
    it("updates existing rows and appends new rows", () => {
      const mockUpdatedRows = [];
      const mockSheet = {
        getLastColumn: () => 8,
        getRange: jest.fn((row, col, height, width) => ({
          setValues: (values) => {
            mockUpdatedRows.push({ row, values: values[0] });
          },
        })),
      };

      const colMap = {
        merchant: 1,
        group: 2,
        category: 3,
        mode: 4,
        count: 5,
        first_seen: 6,
        last_seen: 7,
        status: 8,
      };

      const idx = new Map();

      // Existing entry (should update)
      idx.set("amazon", {
        rowNum: 2,
        merchant: "Amazon",
        group: "Shopping",
        category: "Online",
        mode: "auto",
        count: 6,
        first_seen: "2025-01-01",
        last_seen: "2025-01-10",
        status: STATUS_APPROVED,
        dirty: true,
      });

      // New entry (should append)
      idx.set("walmart", {
        rowNum: null,
        merchant: "Walmart",
        group: "Groceries",
        category: "Food",
        mode: "",
        count: 1,
        first_seen: "2025-01-15",
        last_seen: "2025-01-15",
        status: STATUS_NEEDS_REVIEW,
        dirty: true,
      });

      // Non-dirty entry (should skip)
      idx.set("target", {
        rowNum: 3,
        merchant: "Target",
        group: "",
        category: "",
        mode: "",
        count: 2,
        first_seen: "2025-01-01",
        last_seen: "2025-01-05",
        status: STATUS_NEEDS_REVIEW,
        dirty: false,
      });

      flushUnknowns(mockSheet, colMap, idx, "merchant");

      // Verify update
      expect(mockUpdatedRows).toHaveLength(1);
      expect(mockUpdatedRows[0].row).toBe(2);
      expect(mockSetIfExists).toHaveBeenCalledWith(expect.any(Array), colMap, "merchant", "Amazon");
      expect(mockSetIfExists).toHaveBeenCalledWith(expect.any(Array), colMap, "count", 6);

      // Verify append
      expect(mockAppendRows).toHaveBeenCalledTimes(1);
      expect(mockAppendRows).toHaveBeenCalledWith(
        mockSheet,
        expect.arrayContaining([expect.any(Array)]),
      );

      // Verify dirty flags cleared
      expect(idx.get("amazon").dirty).toBe(false);
      expect(idx.get("walmart").dirty).toBe(false);
    });

    it("does nothing when no entries are dirty", () => {
      const mockSheet = {
        getLastColumn: () => 8,
        getRange: jest.fn(),
      };

      const colMap = { merchant: 1 };
      const idx = new Map();
      idx.set("amazon", {
        rowNum: 2,
        merchant: "Amazon",
        group: "",
        category: "",
        mode: "",
        count: 5,
        first_seen: "2025-01-01",
        last_seen: "2025-01-05",
        status: STATUS_APPROVED,
        dirty: false,
      });

      flushUnknowns(mockSheet, colMap, idx, "merchant");

      expect(mockSheet.getRange).not.toHaveBeenCalled();
      expect(mockAppendRows).not.toHaveBeenCalled();
    });
  });
});

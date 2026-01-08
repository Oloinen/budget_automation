/**
 * Generic utilities for managing "unknown" tracking sheets (merchants, items, etc.)
 * 
 * These sheets track unmatched entities with counts, first/last seen dates, and status.
 * This module provides an in-memory index pattern for efficient batch operations.
 * 
 * Shared by:
 * - credit_card/unknowns.js (unknown_merchants)
 * - receipts/receipt_import.js (unknown_items)
 */

/**
 * Load all rows from an unknowns sheet into an in-memory index (Map).
 * 
 * @param {Sheet} sheet - Google Sheets object
 * @param {Object} colMap - Column name to 1-based column number mapping
 * @param {string} keyColumn - Name of the column used as the primary identifier (e.g., "merchant", "pattern")
 * @param {boolean} normalizeKey - If true, normalize the key using normaliseForMatch()
 * @returns {Map<string, Object>} - Map keyed by normalized/raw key value, values are row objects with {rowNum, ...fields, dirty}
 */
function loadUnknownsIndex(sheet, colMap, keyColumn, normalizeKey = true) {
  if (!colMap[keyColumn]) {
    throw new Error(`unknowns sheet must have column: ${keyColumn}`);
  }

  const idx = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return idx;

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  
  for (let i = 0; i < values.length; i++) {
    const rowNum = i + 2;
    const row = values[i];
    const rawValue = String(row[colMap[keyColumn] - 1] || "").trim();
    if (!rawValue) continue;

    const key = normalizeKey ? normaliseForMatch(rawValue) : rawValue;
    
    // Build object with all known fields
    const entry = {
      rowNum,
      [keyColumn]: rawValue,
      group: String(row[(colMap["group"] || 0) - 1] || ""),
      category: String(row[(colMap["category"] || 0) - 1] || ""),
      mode: String(row[(colMap["mode"] || 0) - 1] || ""),
      count: Number(row[(colMap["count"] || 0) - 1] || 0),
      first_seen: String(row[(colMap["first_seen"] || 0) - 1] || ""),
      last_seen: String(row[(colMap["last_seen"] || 0) - 1] || ""),
      status: String(row[(colMap["status"] || 0) - 1] || ""),
      dirty: false
    };
    
    idx.set(key, entry);
  }
  
  return idx;
}

/**
 * Upsert an unknown entity into the index.
 * 
 * @param {Map} idx - The index returned by loadUnknownsIndex()
 * @param {string} key - The normalized/raw key for lookup
 * @param {string} rawValue - The original, unnormalized value to store
 * @param {string} keyColumn - Name of the key column (e.g., "merchant", "pattern")
 * @param {string} dateStr - Date string for first_seen/last_seen (format: YYYY-MM-DD)
 * @param {string} defaultStatus - Status to assign for new entries (e.g., STATUS_NEEDS_REVIEW)
 */
function upsertUnknown(idx, key, rawValue, keyColumn, dateStr, defaultStatus) {
  const entry = idx.get(key);
  
  if (entry) {
    // Update existing entry
    entry.count = (entry.count || 0) + 1;
    entry.last_seen = dateStr;
    if (!entry.first_seen) entry.first_seen = dateStr;
    entry.dirty = true;
    return;
  }
  
  // Create new entry
  idx.set(key, {
    rowNum: null,
    [keyColumn]: rawValue,
    group: "",
    category: "",
    mode: "",
    count: 1,
    first_seen: dateStr,
    last_seen: dateStr,
    status: defaultStatus || STATUS_NEEDS_REVIEW,
    dirty: true
  });
}

/**
 * Flush all dirty entries from the index back to the sheet.
 * Updates existing rows and appends new rows in batch.
 * 
 * @param {Sheet} sheet - Google Sheets object
 * @param {Object} colMap - Column name to 1-based column number mapping
 * @param {Map} idx - The index with potentially dirty entries
 * @param {string} keyColumn - Name of the key column
 */
function flushUnknowns(sheet, colMap, idx, keyColumn) {
  const width = sheet.getLastColumn();
  const newRows = [];
  
  for (const entry of idx.values()) {
    if (!entry.dirty) continue;
    
    const row = new Array(width).fill("");
    
    // Set all known fields
    setIfExists(row, colMap, keyColumn, entry[keyColumn]);
    setIfExists(row, colMap, "group", entry.group);
    setIfExists(row, colMap, "category", entry.category);
    setIfExists(row, colMap, "mode", entry.mode);
    setIfExists(row, colMap, "count", entry.count);
    setIfExists(row, colMap, "first_seen", entry.first_seen);
    setIfExists(row, colMap, "last_seen", entry.last_seen);
    setIfExists(row, colMap, "status", entry.status);
    
    if (entry.rowNum) {
      // Update existing row
      sheet.getRange(entry.rowNum, 1, 1, width).setValues([row]);
    } else {
      // Queue for append
      newRows.push(row);
    }
    
    entry.dirty = false;
  }
  
  if (newRows.length) {
    appendRows(sheet, newRows);
  }
}

// Export for both Apps Script and Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadUnknownsIndex,
    upsertUnknown,
    flushUnknowns
  };
}

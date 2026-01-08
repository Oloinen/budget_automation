// Wrapper functions for unknown items tracking
// Provides semantic API that matches credit_card/unknowns.js pattern

function loadUnknownItemsIndex(sheet, colMap) {
  return loadUnknownsIndex(sheet, colMap, "pattern", true);
}

function upsertUnknownItem(idx, itemKey, itemName, dateStr) {
  upsertUnknown(idx, itemKey, itemName, "pattern", dateStr, STATUS_NEEDS_REVIEW);
}

function flushUnknownItems(sheet, colMap, idx) {
  flushUnknowns(sheet, colMap, idx, "pattern");
}

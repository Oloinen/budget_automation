// Wrapper for backward compatibility
function loadUnknownMerchantsIndex(sheet, colMap) {
  return loadUnknownsIndex(sheet, colMap, "merchant", true);
}

// Wrapper for backward compatibility
function upsertUnknownMerchant(idx, merchantStmtLower, merchantRaw, dateStr) {
  upsertUnknown(idx, merchantStmtLower, merchantRaw, "merchant", dateStr, STATUS_NEEDS_REVIEW);
}

// Wrapper for backward compatibility
function flushUnknownMerchants(sheet, colMap, idx) {
  flushUnknowns(sheet, colMap, idx, "merchant");
}

function loadUnknownMerchantsIndex(sheet, colMap) {
  if (!colMap["merchant"]) throw new Error("unknown_merchants must have column: merchant");

  const idx = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return idx;

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    const rowNum = i + 2;
    const row = values[i];
    const merchant = String(row[colMap["merchant"] - 1] || "").trim();
    if (!merchant) continue;

    const key = normaliseForMatch(merchant);
    idx.set(key, {
      rowNum,
      merchant,
      category: String(row[(colMap["category"] || 0) - 1] || ""),
      mode: String(row[(colMap["mode"] || 0) - 1] || ""),
      count: Number(row[(colMap["count"] || 0) - 1] || 0),
      first_seen: String(row[(colMap["first_seen"] || 0) - 1] || ""),
      last_seen: String(row[(colMap["last_seen"] || 0) - 1] || ""),
      dirty: false
    });
  }
  return idx;
}

function upsertUnknownMerchant(idx, merchantStmtLower, merchantRaw, dateStr) {
  const key = merchantStmtLower; // already normalised
  const e = idx.get(key);

  if (e) {
    e.count = (e.count || 0) + 1;
    e.last_seen = dateStr;
    if (!e.first_seen) e.first_seen = dateStr;
    e.dirty = true;
    return;
  }

  idx.set(key, {
    rowNum: null,
    merchant: merchantRaw,
    category: "",
    mode: "unknown",
    count: 1,
    first_seen: dateStr,
    last_seen: dateStr,
    dirty: true
  });
}

function flushUnknownMerchants(sheet, colMap, idx) {
  const width = sheet.getLastColumn();
  const newRows = [];

  for (const e of idx.values()) {
    if (!e.dirty) continue;

    const row = new Array(width).fill("");
    setIfExists(row, colMap, "merchant", e.merchant);
    setIfExists(row, colMap, "category", e.category);
    setIfExists(row, colMap, "mode", e.mode);
    setIfExists(row, colMap, "count", e.count);
    setIfExists(row, colMap, "first_seen", e.first_seen);
    setIfExists(row, colMap, "last_seen", e.last_seen);

    if (e.rowNum) {
      sheet.getRange(e.rowNum, 1, 1, width).setValues([row]);
    } else {
      newRows.push(row);
    }
    e.dirty = false;
  }

  if (newRows.length) appendRows(sheet, newRows);
}

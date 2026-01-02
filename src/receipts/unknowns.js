// Unknown items index management
function loadUnknownItemsIndex(sheet, colMap) {
  if (!colMap["pattern"]) throw new Error("unknown_items must have column: pattern");

  const idx = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return idx;

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    const rowNum = i + 2;
    const row = values[i];

    const pattern = String(row[colMap["pattern"] - 1] || "").trim();
    if (!pattern) continue;

    const key = normaliseForMatch(pattern);
    idx.set(key, {
      rowNum,
      pattern,
      count: Number(row[(colMap["count"] || 0) - 1] || 0),
      first_seen: String(row[(colMap["first_seen"] || 0) - 1] || ""),
      last_seen: String(row[(colMap["last_seen"] || 0) - 1] || ""),
      dirty: false
    });
  }

  return idx;
}

function upsertUnknownItem(idx, patternRaw, dateStr) {
  const pattern = String(patternRaw || "").trim();
  if (!pattern) return;

  const key = normaliseForMatch(pattern);
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
    pattern,
    count: 1,
    first_seen: dateStr,
    last_seen: dateStr,
    dirty: true
  });
}

function flushUnknownItems(sheet, colMap, idx) {
  const width = sheet.getLastColumn();
  const newRows = [];

  for (const e of idx.values()) {
    if (!e.dirty) continue;

    const row = new Array(width).fill("");
    setIfExists(row, colMap, "pattern", e.pattern);
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

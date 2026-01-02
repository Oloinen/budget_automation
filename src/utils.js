function getTabByName(sheet, name) {
  const tab = sheet.getSheetByName(name);
  if (!tab) throw new Error(`Missing tab: ${name}`);
  return tab;
}

function getHeaders(tab) {
  const headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    const key = String(header || "").trim();
    if (key) map[key] = index + 1;
  });
  return map;
}

function readColumnValues(tab, headerName) {
  const map = getHeaders(tab);
  const col = map[headerName];
  if (!col) return [];
  const lastRow = tab.getLastRow();
  if (lastRow < 2) return [];
  return tab.getRange(2, col, lastRow - 1, 1).getValues().flat();
}

function appendRows(tab, rows) {
  if (!rows || rows.length === 0) return;
  const startRow = tab.getLastRow() + 1;
  tab.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

function setIfExists(row, colMap, header, value) {
  const col = colMap[header];
  if (!col) return;
  row[col - 1] = value;
}

function makeRow(colMap, data) {
  const width = Math.max(...Object.values(colMap));
  const row = new Array(width).fill("");

  for (const [key, value] of Object.entries(data)) {
    setIfExists(row, colMap, key, value);
  }
  return row;
}

function parseAmount(value) {
  const string = String(value ?? "").trim().replace(/\s+/g, "");
  if (!string) return NaN;
  return Number(string.replace(",", "."));
}

function parseDate(dateString) {
  const string = String(dateString).trim();

  // YYYY-MM-DD or YYYY/MM/DD
  let m = string.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  // DD.MM.YYYY
  m = string.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));

  const d = new Date(string);
  return isNaN(d.getTime()) ? null : d;
}

function makeTxId(payload) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(payload));
  return bytes.map(b => ("0" + (b & 0xff).toString(16)).slice(-2)).join("").slice(0, 24);
}

function normaliseForMatch(string) {
  // Keep hyphens. Just lowercase + collapse spaces.
  return String(string || "").toLowerCase().trim().replace(/\s+/g, " ");
}
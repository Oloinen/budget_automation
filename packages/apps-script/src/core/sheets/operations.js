/**
 * Sheet operations - CRUD and data access utilities
 */

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
  return tab
    .getRange(2, col, lastRow - 1, 1)
    .getValues()
    .flat();
}

function appendRows(tab, rows) {
  if (!rows || rows.length === 0) return;
  const startRow = tab.getLastRow() + 1;
  tab.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

module.exports = {
  getTabByName,
  getHeaders,
  readColumnValues,
  appendRows,
};

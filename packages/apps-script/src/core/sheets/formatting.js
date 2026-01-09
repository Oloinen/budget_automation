/**
 * Sheet formatting utilities - row and column formatting
 */

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

module.exports = {
  setIfExists,
  makeRow,
};

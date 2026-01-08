function listStatementCsvFiles(folderId, latestOnly) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  const all = [];
  while (files.hasNext()) {
    const f = files.next();
    const name = (f.getName() || "").toLowerCase();
    if (!name.endsWith(".csv")) continue;
    all.push(f);
  }
  if (all.length === 0) return [];

  if (!latestOnly) return all;

  all.sort((a, b) => b.getLastUpdated().getTime() - a.getLastUpdated().getTime());
  return [all[0]];
}

/**
 * Validate CSV headers and return column indices for known columns.
 * Throws an Error if required headers are missing.
 * @param {string[]} headers
 * @returns {{dateCol:number,merchantCol:number,amountCol:number}}
 */
function validateCsvHeaders(headers) {
  const required = [CSV_COL_DATE, CSV_COL_MERCHANT, CSV_COL_AMOUNT];
  const missing = required.filter((h) => !headers.includes(h));

  if (missing.length > 0) {
    throw new Error(`CSV format changed! Missing columns: ${missing.join(", ")}`);
  }

  return {
    dateCol: headers.indexOf(CSV_COL_DATE),
    merchantCol: headers.indexOf(CSV_COL_MERCHANT),
    amountCol: headers.indexOf(CSV_COL_AMOUNT),
  };
}

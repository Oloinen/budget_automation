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
  // Handle both '1 234,56' and '1,234.56' formats:
  if (string.includes(',') && string.includes('.')) {
    // Decide which separator is the decimal based on which occurs last.
    const lastDot = string.lastIndexOf('.');
    const lastComma = string.lastIndexOf(',');
    if (lastComma > lastDot) {
      // comma is decimal, dots are thousand separators: remove dots, replace comma with dot
      return Number(string.replace(/\./g, '').replace(',', '.'));
    } else {
      // dot is decimal, commas are thousand separators: remove commas
      return Number(string.replace(/,/g, ''));
    }
  }
  if (string.includes(',')) return Number(string.replace(',', '.'));
  return Number(string);
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
  if (typeof Utilities !== 'undefined' && Utilities.computeDigest) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(payload));
    return bytes.map(b => ("0" + (b & 0xff).toString(16)).slice(-2)).join("").slice(0, 24);
  }
  // Node fallback
  try {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(String(payload)).digest('hex');
    return String(hash).slice(0, 24);
  } catch (e) {
    // Last-resort: simple hex of utf8 payload
    return Buffer.from(String(payload), 'utf8').toString('hex').slice(0, 24);
  }
}

function normaliseForMatch(string) {
  // Keep hyphens. Just lowercase + collapse spaces.
  return String(string || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function roundValue(v) {
    return Math.round((v + Number.EPSILON) * 100) / 100;
  }

  function findBestRule(needle, rules) {
    if (!rules || rules.length === 0) return null;
    const n = String(needle || '');
    const matches = [];
    for (const r of rules) {
      if (!r || !r.pattern) continue;
      const p = String(r.pattern);
      if (p && n.includes(p)) matches.push(r);
    }
    if (matches.length === 1) return matches[0];
    return null;
  }

  function setTestGlobals(overrides = {}) {
    try {
      const g = (typeof global !== 'undefined') ? global : (typeof globalThis !== 'undefined' ? globalThis : null);
      if (!g) return;
      for (const k of Object.keys(overrides)) {
        try { g[k] = overrides[k]; } catch (e) { /* ignore */ }
      }
    } catch (e) {
      // noop
    }
  }

/**
 * Load rules from a sheet with flexible column names
 * Patterns are always normalized for consistent matching.
 * @param {Sheet} tab - The sheet to read from
 * @param {string} patternColumn - Name of the column containing the pattern (e.g., "merchant" or "pattern")
 * @param {Object} options - Optional configuration
 * @param {boolean} options.sortByLength - Whether to sort rules by pattern length descending (default: false)
 * @returns {Array} Array of rule objects with {pattern, group, category, mode}
 */
function loadRules(tab, patternColumn, options = {}) {
  const { sortByLength = false } = options;
  
  const values = tab.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const iPattern = headers.indexOf(patternColumn);
  const iGroup = headers.indexOf("group");
  const iCategory = headers.indexOf("category");
  const iMode = headers.indexOf("mode");

  if (iPattern === -1 || iGroup === -1 || iCategory === -1 || iMode === -1) {
    throw new Error(`Rules sheet must have headers: ${patternColumn}, group, category, mode`);
  }

  const rules = [];
  for (const value of values.slice(1)) {
    const rawPattern = String(value[iPattern] || "").trim();
    if (!rawPattern) continue;

    const pattern = normaliseForMatch(rawPattern);
    const group = String(value[iGroup] || "").trim();
    const category = String(value[iCategory] || "").trim();
    const mode = String(value[iMode] || "").trim().toLowerCase() || "auto";

    rules.push({ pattern, group, category, mode });
  }

  if (sortByLength) {
    rules.sort((a, b) => b.pattern.length - a.pattern.length);
  }

  return rules;
}

function toIso(d) {
  // Apps Script Date -> ISO-like string in spreadsheet-friendly format
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function toMonth(yyyyMmDd) {
  // expects "YYYY-MM-DD"
  if (!yyyyMmDd || typeof yyyyMmDd !== "string" || yyyyMmDd.length < 7) return "";
  return yyyyMmDd.substring(0, 7); // "YYYY-MM"
}

function truncate(s, maxLen) {
  const str = String(s ?? "");
  return str.length <= maxLen ? str : str.substring(0, maxLen);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getTabByName,
    getHeaders,
    readColumnValues,
    appendRows,
    setIfExists,
    makeRow,
    parseAmount,
    parseDate,
    makeTxId,
    roundValue,
    findBestRule,
    normaliseForMatch,
    loadRules,
    toIso,
    toMonth,
    truncate
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports.setTestGlobals = setTestGlobals;
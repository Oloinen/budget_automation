/***********************
 * RECEIPT IMPORT (PDF -> OCR -> staging/ready + unknown_items)
 *
 * Design per your rule:
 *  - item_rules.mode = auto   => aggregated into receipt_ready
 *  - item_rules.mode = review => goes to receipt_staging (NOT ready)
 *  - item not matched         => goes to receipt_staging + unknown_items upsert
 *  - item_rules.mode = skip   => ignored
 *
 * One receipt PDF = one import unit.
 *
 * Data sheet tabs + required headers:
 *
 * item_rules:
 *   pattern, group, category, mode
 *
 * receipt_ready:
 *   tx_id, date, month, merchant, amount, group, category, posted_at, receipt_id
 *
 * receipt_staging:
 *   receipt_id, date, merchant, line, amount, rule_mode, proposed_group, proposed_category, status, posted_at
 *
 * unknown_items:
 *   pattern, count, first_seen, last_seen
 *   (optional columns are ignored)
 *
 * receipt_files:
 *   receipt_id, file_id, file_name, imported_at, status, detected_date, detected_merchant, note
 *
 * Folder:
 *  - Receipts inbox folder (PDFs)
 *  - Optional processed folder to move PDFs after import
 *
 * Requires:
 *  - Apps Script Project Settings timezone: Europe/Helsinki
 *  - Advanced Google Services: Drive API (v2) enabled (Services -> add Drive API)
 *  - Google Cloud project: Drive API enabled
 ***********************/

/*
  Parser/rules/ocr/unknowns implementations have been moved into
  src/receipts/{parser,rules,ocr_io,unknowns}.js to keep the main file small.
  Functions remain global in Apps Script runtime.
*/
function ocrPdfToText(pdfFile) {
  // Requires Advanced Google Service "Drive" enabled (v2)
  const resource = {
    title: `OCR_${pdfFile.getName()}_${pdfFile.getId()}`,
    mimeType: "application/vnd.google-apps.document"
  };

  const docFile = Drive.Files.insert(resource, pdfFile.getBlob(), { ocr: true });
  const doc = DocumentApp.openById(docFile.id);
  const text = doc.getBody().getText() || "";

  // Clean up OCR doc
  DriveApp.getFileById(docFile.id).setTrashed(true);
  return text;
}

/********** Item rules **********/
function loadItemRules(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const iPattern = headers.indexOf("pattern");
  const iGroup = headers.indexOf("group");
  const iCategory = headers.indexOf("category");
  const iMode = headers.indexOf("mode");

  if (iPattern === -1 || iGroup === -1 || iCategory === -1 || iMode === -1) {
    throw new Error(`item_rules must have headers: pattern, group, category, mode`);
  }

  const rules = [];
  for (const r of values.slice(1)) {
    const patRaw = String(r[iPattern] || "").trim();
    if (!patRaw) continue;

    const pattern = normaliseForMatch(patRaw);
    const group = String(r[iGroup] || "").trim();
    const category = String(r[iCategory] || "").trim();
    const mode = String(r[iMode] || "").trim().toLowerCase() || "auto";

    rules.push({ pattern, group, category, mode });
  }

  rules.sort((a, b) => b.pattern.length - a.pattern.length);
  return rules;
}

// Uses shared `findBestRule` from src/utils.js in Node tests and Apps Script.

/********** Receipt parsing **********/
function splitLines(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function normaliseForMatch(s) {
  // Lowercase + collapse whitespace. Keep hyphens etc.
  return String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function extractDate(lines, tz) {
  // Finnish: 1.1.2026 or 01.01.2026
  for (const line of lines.slice(0, 80)) {
    const m = line.match(/(\d{1,2})\.(\d{1,2})\.(20\d{2})/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      const yyyy = Number(m[3]);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }
  }
  // ISO: 2026-01-01
  for (const line of lines.slice(0, 80)) {
    const m = line.match(/(20\d{2})-(\d{2})-(\d{2})/);
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  return null;
}

function extractMerchant(lines) {
  // Heuristic: first "brand-like" line near the top
  const hay = lines.slice(0, 30);
  const keywords = ["k-market", "k-supermarket", "s-market", "alepa", "sale", "lidl", "prisma", "k citymarket", "citymarket"];
  for (const line of hay) {
    const low = line.toLowerCase();
    if (keywords.some(k => low.includes(k))) return line;
  }
  // Fallback: first line with letters that isn't clearly a date/number
  for (const line of hay) {
    if (/[a-zåäö]/i.test(line) && !/^\d/.test(line)) return line;
  }
  return "";
}

function parseReceiptItemLines(lines) {
  // Extremely pragmatic:
  // - take lines that end with an amount like 2,39 or -1,00 or 2.39
  // - treat everything before the amount as the item name
  // - skip obvious junk lines (totals/vat/card/address-ish)
  const junkContains = [
    "yhteensä", "summa", "loppusumma", "subtotal", "total",
    "alv", "vat",
    "kortti", "visa", "mastercard", "debit", "credit",
    "kiitos", "thanks",
    "kassa", "kuitti", "receipt",
    "puh", "tel", "phone",
    "osoite", "address"
  ];

  const items = [];

  for (const line of lines) {
    const low = line.toLowerCase();
    if (junkContains.some(j => low.includes(j))) continue;

    // Trailing money: -0,99 or 10,00 or 10.00
    const m = line.match(/(-?\d+[,.]\d{2})\s*$/);
    if (!m) continue;

    const amount = parseAmount(m[1]);
    if (!isFinite(amount)) continue;

    const name = line.slice(0, m.index).trim();
    if (!name) continue;

    // skip lines that are basically quantities/price-per-kg with no meaningful name
    if (/^(\d+[,.]?\d*)\s*(kg|kpl|g|l|dl)\b/i.test(name)) continue;

    items.push({ line, name, amount });
  }

  return { items };
}

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/********** Unknown items **********/
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

/********** IDs / helpers **********/
function makeReceiptId(file) {
  // stable per file content version: fileId + lastUpdated
  const payload = `${file.getId()}|${file.getLastUpdated().toISOString()}`;
  // reuse shared makeTxId from utils and take first 20 chars
  return makeTxId(payload).slice(0, 20);
}

/** Sheet plumbing functions are provided by src/utils.js (getTabByName, getHeaders,
 * readColumnValues, appendRows, setIfExists, makeRow, parseAmount, makeTxId, normaliseForMatch, etc.)
 */

// Pure processing helper for receipts: given OCR text (string) and options,
// return rows to write for `receipt_ready`, `receipt_staging`, and unknown items.
// `opts` may include: { tz, budgetYear, rules }
function processReceiptText(text, opts = {}) {
  const tz = opts.tz || (typeof Session !== 'undefined' && Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'UTC');
  const BUDGET_YEAR_LOCAL = Number(opts.budgetYear || (typeof BUDGET_YEAR !== 'undefined' ? BUDGET_YEAR : new Date().getFullYear()));
  const rules = opts.rules || [];
  const formatDate = opts.formatDate || function(date, tzArg, pattern) {
    const d = (date instanceof Date) ? date : new Date(date);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    if (pattern === 'yyyy') return String(yyyy);
    if (pattern === 'yyyy-MM') return `${yyyy}-${mm}`;
    if (pattern === 'yyyy-MM-dd') return `${yyyy}-${mm}-${dd}`;
    return d.toISOString();
  };

  const lines = splitLines(text);
  const detectedDate = extractDate(lines, tz);
  const detectedMerchant = extractMerchant(lines) || '';
  const receiptId = opts.receiptId || null;

  const parsed = parseReceiptItemLines(lines);
  const items = parsed.items || [];

  const rowsToReady = [];
  const rowsToStaging = [];
  const unknowns = [];

  // If no date found, skip processing
  if (!detectedDate) return { rowsToReady, rowsToStaging, unknowns, detectedDate, detectedMerchant };
  const txYear = detectedDate.getUTCFullYear();
  if (txYear !== BUDGET_YEAR_LOCAL) return { rowsToReady, rowsToStaging, unknowns, detectedDate, detectedMerchant };

  const dateStr = formatDate(detectedDate, tz, 'yyyy-MM-dd');
  const monthStr = formatDate(detectedDate, tz, 'yyyy-MM');

  // For each item, find best rule
  for (const it of items) {
    const nameNorm = normaliseForMatch(it.name);
    const rule = findBestRule(nameNorm, rules);
    const amount = round2(it.amount || 0);

    if (!rule) {
      // push to staging as unknown
      rowsToStaging.push({
        receipt_id: receiptId,
        date: dateStr,
        merchant: detectedMerchant,
        line: it.line,
        amount: amount,
        rule_mode: 'unknown',
        proposed_group: '',
        proposed_category: '',
        status: STATUS_BLOCKED,
        posted_at: ''
      });
      unknowns.push({ pattern: it.name, date: dateStr });
      continue;
    }

    if (rule.mode === 'skip') continue;

    if (rule.mode === 'auto') {
      rowsToReady.push({
        tx_id: makeTxId(`${dateStr}|${detectedMerchant}|${amount}|receipt`),
        date: dateStr,
        month: monthStr,
        merchant: detectedMerchant,
        amount: amount,
        group: rule.group || '',
        category: rule.category || '',
        posted_at: new Date().toISOString(),
        receipt_id: receiptId,
        source: 'receipt'
      });
    } else {
      rowsToStaging.push({
        receipt_id: receiptId,
        date: dateStr,
        merchant: detectedMerchant,
        line: it.line,
        amount: amount,
        rule_mode: rule.mode || 'review',
        proposed_group: rule.group || '',
        proposed_category: rule.category || '',
        status: STATUS_NEEDS_REVIEW,
        posted_at: ''
      });
    }
  }

  return { rowsToReady, rowsToStaging, unknowns, detectedDate, detectedMerchant };
}

if (typeof module !== 'undefined' && module.exports) module.exports = module.exports || {};
if (typeof module !== 'undefined' && module.exports) module.exports.processReceiptText = processReceiptText;


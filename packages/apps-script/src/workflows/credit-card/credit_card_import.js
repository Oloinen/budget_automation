/***********************
 * CREDIT CARD IMPORT (statement CSV -> data sheet tables)
 *
 * Tabs used: merchant_rules, credit_card_staging, transactions_ready,
 *            unknown_merchants, credit_card_skipped
 * (See config.js HEADERS_* for schema)
 *
 * Matching:
 *  - case-insensitive substring: rule.merchant is substring of statement "Location of purchase"
 *  - longest rule.merchant wins
 *
 * Year filter:
 *  - imports only rows where "Date of payment" year == BUDGET_YEAR
 *
 * Idempotency:
 *  - will NOT re-import rows whose tx_id already exists in staging/ready/skipped
 *
 * Mode behavior:
 *  - auto   -> transactions_ready
 *  - review -> credit_card_staging (status = NEEDS_REVIEW)
 *  - skip   -> credit_card_skipped
 *  - no match -> credit_card_staging (status = NEEDS_RULE) + unknown_merchants upsert
 *
 * NOTE: statement amounts are negative for expenses; script stores absolute value (positive).
 ***********************/

/* exported setupDailyCcImport0400, runCreditCardImport */

// Import utilities from organized core modules
const { getTabByName, getHeaders, readColumnValues, appendRows } = require("../../core/sheets/operations");
const { makeRow } = require("../../core/sheets/formatting");
const { loadRules, findBestRule } = require("../../core/sheets/rules");
const { parseAmount, parseDate, normaliseForMatch } = require("../../core/parsers/data");
const { makeTxId } = require("../../core/parsers/id");
const { parseCsv } = require("../../core/parsers/csv");
const { roundValue, checkApiQuota } = require("../../core/utilities");
const { loadUnknownsIndex, upsertUnknown, flushUnknowns } = require("../../core/unknowns");

/********** TRIGGER (optional) **********/

function setupDailyCcImport0400() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "runCreditCardImport") ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger("runCreditCardImport")
    .timeBased()
    .everyDays(1)
    .atHour(4)
    .nearMinute(0)
    .create();
}

/********** MAIN **********/
/**
 * Internal import logic with dependency injection.
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.SpreadsheetApp - Apps Script SpreadsheetApp API
 * @param {Object} deps.DriveApp - Apps Script DriveApp API
 * @param {Object} deps.Session - Apps Script Session API
 * @param {Function} deps.getBudgetDataSheetId - Function to get budget sheet ID
 * @param {Function} deps.getCreditCardStatementsFolderId - Function to get CC folder ID
 * @param {Object} deps.schema - Schema constants (TAB_*, HEADERS_*, STATUS_*)
 * @param {Function} [deps.checkApiQuota] - Optional quota check function
 */
function _runCreditCardImport(deps) {
  // Extract dependencies with fallbacks for backwards compatibility
  const SpreadsheetApp = deps?.SpreadsheetApp || globalThis.SpreadsheetApp;
  const DriveApp = deps?.DriveApp || globalThis.DriveApp;
  const Session = deps?.Session || globalThis.Session;
  const getBudgetDataSheetId =
    deps?.getBudgetDataSheetId || (() => globalThis.BUDGET_DATA_SHEET_ID);
  const getCreditCardStatementsFolderId =
    deps?.getCreditCardStatementsFolderId || (() => globalThis.CREDIT_CARD_STATEMENTS_FOLDER_ID);
  const schema = deps?.schema || require("../../../shared/schema");
  const checkApiQuota = deps?.checkApiQuota || globalThis.checkApiQuota;

  const tz = Session.getScriptTimeZone(); // Europe/Helsinki in project settings
  // API quota guard
  try {
    if (typeof checkApiQuota === "function") checkApiQuota();
  } catch (e) {
    const { createQuotaError } = require("../../core/error_handler");
    throw createQuotaError("credit card import", e);
  }

  const budgetData = SpreadsheetApp.openById(getBudgetDataSheetId());

  const tabRules = getTabByName(budgetData, schema.TAB_MERCHANT_RULES);
  const tabStaging = getTabByName(budgetData, schema.TAB_CC_STAGING);
  const tabReady = getTabByName(budgetData, schema.TAB_TRANSACTIONS_READY);
  const tabUnknown = getTabByName(budgetData, schema.TAB_MERCHANTS_UNKNOWN);
  const tabSkipped = getTabByName(budgetData, schema.TAB_CC_SKIPPED);

  const rules = loadRules(tabRules, "merchant", { sortByLength: true }); // array, longest-first

  const mapStaging = getHeaders(tabStaging);
  const mapReady = getHeaders(tabReady);
  const mapUnknown = getHeaders(tabUnknown);
  const mapSkipped = getHeaders(tabSkipped);

  // Idempotency: existing tx_ids across all destinations
  const existingTxIds = new Set(
    [
      ...readColumnValues(tabStaging, "tx_id"),
      ...readColumnValues(tabReady, "tx_id"),
      ...readColumnValues(tabSkipped, "tx_id"),
    ].filter(Boolean),
  );

  // Unknown merchant index (keyed by normalised merchant string)
  const unknownIdx = loadUnknownsIndex(tabUnknown, mapUnknown);

  const csvFiles = listStatementCsvFiles(
    getCreditCardStatementsFolderId(),
    READ_ONLY_LATEST_CSV,
    DriveApp,
  );
  if (csvFiles.length === 0) return { success: true, message: "No files to process" };

  const allRecords = [];
  for (const file of csvFiles) {
    const csvText = file.getBlob().getDataAsString("UTF-8");
    const { header, records } = parseCsv(csvText);
    if (!header.length) continue;

    // Validate headers and get column indices
    const cols = validateCsvHeaders(header);
    const iDate = cols.dateCol;
    const iMerchant = cols.merchantCol;
    const iAmount = cols.amountCol;

    for (const record of records) {
      allRecords.push({
        dateRaw: String(record[iDate] || "").trim(),
        merchantRaw: String(record[iMerchant] || "").trim(),
        amountRaw: record[iAmount],
      });
    }
  }

  const result = processCreditCardRecords(allRecords, {
    tz,
    budgetYear: BUDGET_YEAR,
    rules,
    existingTxIds: Array.from(existingTxIds),
    findBestRule,
    makeTxId,
    parseDate,
    parseAmount,
    normaliseForMatch,
    roundValue,
  });

  if (result.rowsToReady && result.rowsToReady.length) {
    const arr = result.rowsToReady.map((o) => makeRow(mapReady, o));
    appendRows(tabReady, arr);
  }

  if (result.rowsToStaging && result.rowsToStaging.length) {
    const arr = result.rowsToStaging.map((o) => makeRow(mapStaging, o));
    appendRows(tabStaging, arr);
  }

  if (result.rowsToSkipped && result.rowsToSkipped.length) {
    const arr = result.rowsToSkipped.map((o) => makeRow(mapSkipped, o));
    appendRows(tabSkipped, arr);
  }

  // upsert unknown merchants gathered by processor
  for (const u of result.unknowns || []) {
    upsertUnknown(unknownIdx, u.key || normaliseForMatch(u.merchant), u.merchant, u.date);
  }

  flushUnknowns(tabUnknown, mapUnknown, unknownIdx);
}

/**
 * Public entrypoint for Apps Script - creates deps object from globals.
 * Can be called with explicit deps for testing: runCreditCardImport(deps)
 */
function runCreditCardImport(deps) {
  const { handleWorkflowErrors } = require("../../core/error_handler");

  // If no deps provided, create from globals (Apps Script runtime)
  if (!deps) {
    const runtimeIds = require("../../core/runtime-ids");
    const schema = require("../../../../shared/schema");
    deps = {
      SpreadsheetApp: globalThis.SpreadsheetApp,
      DriveApp: globalThis.DriveApp,
      Session: globalThis.Session,
      getBudgetDataSheetId: runtimeIds.getBudgetDataSheetId,
      getCreditCardStatementsFolderId: runtimeIds.getCreditCardStatementsFolderId,
      schema: schema,
      checkApiQuota: globalThis.checkApiQuota,
    };
  }

  return handleWorkflowErrors("CreditCardImport", deps, () => {
    return _runCreditCardImport(deps);
  });
}

// Pure processing helper: given parsed records, return rows to write.
// `records` should be array of objects: { dateRaw, merchantRaw, amountRaw }
// `opts` can override utilities for testing: { tz, budgetYear, rules, existingTxIds, findBestRule, makeTxId, parseDate, parseAmount, normaliseForMatch, roundValue }
function processCreditCardRecords(records, opts = {}) {
  const tz =
    opts.tz ||
    (typeof Session !== "undefined" && Session.getScriptTimeZone
      ? Session.getScriptTimeZone()
      : "UTC");
  const BUDGET_YEAR_LOCAL = Number(
    opts.budgetYear ||
      (typeof BUDGET_YEAR !== "undefined" ? BUDGET_YEAR : new Date().getFullYear()),
  );
  const rules = opts.rules || [];
  const existingTxIds = new Set(opts.existingTxIds || []);
  const findRule = opts.findBestRule || findBestRule;
  const mkTxId = opts.makeTxId || makeTxId;
  const pDate = opts.parseDate || parseDate;
  const pAmount = opts.parseAmount || parseAmount;
  const norm = opts.normaliseForMatch || normaliseForMatch;
  const round = opts.roundValue || roundValue;
  const formatDate =
    opts.formatDate ||
    function (date, tzArg, pattern) {
      const d = date instanceof Date ? date : new Date(date);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      if (pattern === "yyyy") return String(yyyy);
      if (pattern === "yyyy-MM") return `${yyyy}-${mm}`;
      if (pattern === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
      return d.toISOString();
    };

  const rowsToStaging = [];
  const rowsToReady = [];
  const rowsToSkipped = [];
  const unknowns = [];

  for (const r of records) {
    const dateRaw = String(r.dateRaw || "").trim();
    const merchantRaw = String(r.merchantRaw || "").trim();
    const amountRawInput = r.amountRaw;
    const amountRaw = isFinite(amountRawInput) ? Number(amountRawInput) : pAmount(amountRawInput);

    if (!dateRaw || !merchantRaw || !isFinite(amountRaw)) continue;
    const txDate = pDate(dateRaw);
    if (!txDate) continue;
    const txYear = Number(formatDate(txDate, tz, "yyyy"));
    if (txYear !== BUDGET_YEAR_LOCAL) continue;
    const dateStr = formatDate(txDate, tz, "yyyy-MM-dd");
    const monthStr = formatDate(txDate, tz, "yyyy-MM");

    const amountAbs = round(Math.abs(amountRaw));

    // Refunds (positive amounts) staged
    if (amountRaw > 0) {
      rowsToStaging.push({
        tx_id: null,
        date: dateStr,
        merchant: merchantRaw,
        amount: amountAbs,
        rule_mode: "refund",
        group: "",
        category: "",
        posted_at: "",
        status: STATUS_NEEDS_REVIEW,
      });
      continue;
    }

    const txId = mkTxId(`${dateStr}|${merchantRaw}|${amountAbs}|credit_card`);
    if (existingTxIds.has(txId)) continue;
    existingTxIds.add(txId);

    const merchantTrimmed = norm(merchantRaw);
    const merchantRule = findRule(merchantTrimmed, rules);
    const nowIso = new Date().toISOString();
    const mode = merchantRule ? merchantRule.mode : "unknown";

    switch (mode) {
      case "skip":
        rowsToSkipped.push({
          tx_id: txId,
          date: dateStr,
          merchant: merchantRaw,
          amount: amountAbs,
          receipt_id: "",
          verified: false,
          verified_at: "",
        });
        break;
      case "auto":
        rowsToReady.push({
          tx_id: txId,
          date: dateStr,
          month: monthStr,
          merchant: merchantRaw,
          amount: amountAbs,
          group: merchantRule.group || "",
          category: merchantRule.category || "",
          posted_at: nowIso,
          source: "credit_card",
        });
        break;
      case "review":
        rowsToStaging.push({
          tx_id: txId,
          date: dateStr,
          merchant: merchantRaw,
          amount: amountAbs,
          rule_mode: "review",
          group: merchantRule.group || "",
          category: merchantRule.category || "",
          posted_at: "",
          status: STATUS_NEEDS_REVIEW,
        });
        break;
      default:
        rowsToStaging.push({
          tx_id: txId,
          date: dateStr,
          merchant: merchantRaw,
          amount: amountAbs,
          rule_mode: "unknown",
          group: "",
          category: "",
          posted_at: "",
          status: STATUS_NEEDS_RULE,
        });
        unknowns.push({ merchant: merchantRaw, key: merchantTrimmed, date: dateStr });
    }
  }

  return { rowsToReady, rowsToStaging, rowsToSkipped, unknowns, existingTxIds };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { processCreditCardRecords };
}

/***********************
 * CREDIT CARD IMPORT (statement CSV -> data sheet tables)
 *
 * Data (database) spreadsheet tabs + headers (snake_case tabs, as you listed):
 *  - merchant_rules:        merchant, group, category, mode
 *  - credit_card_staging:   tx_id, date, merchant, amount, rule_mode, group, category, posted_at, status
 *  - credit_card_ready:     tx_id, date, month, merchant, amount, group, category, posted_at
 *  - unknown_merchants:     merchant, category, mode, count, first_seen, last_seen
 *  - credit_card_skipped:   tx_id, date, merchant, amount, receipt_id, verified, verified_at
 *
 * Matching:
 *  - case-insensitive substring: merchantRule.merchant is substring of statement "Location of purchase"
 *  - longest merchantRule.merchant wins
 *
 * Year filter:
 *  - imports only rows where "Date of payment" year == BUDGET_YEAR
 *
 * Idempotency:
 *  - will NOT re-import rows whose tx_id already exists in staging/ready/skipped
 *
 * mode behavior:
 *  - auto  -> credit_card_ready
 *  - review -> credit_card_staging (status = needs_review)
 *  - skip  -> credit_card_skipped (verified=false, verified_at empty, receipt_id empty)
 *  - no match -> credit_card_staging (status = blocked) + unknown_merchants upsert
 *
 * NOTE: statement amounts are negative for expenses; script stores absolute value (positive).
 * If you want to keep negatives, change `const amountAbs = Math.abs(amountRaw);`
 ***********************/

/********** TRIGGER (optional) **********/

function setupDailyCcImport0400() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "runCreditCardImport") ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger("runCreditCardImport")
    .timeBased()
    .everyDays(1)
    .atHour(4)
    .nearMinute(0)
    .create();
}

// Helpers imported from utils.js: getTabByName, getHeaders, readColumnValues,
// appendRows, setIfExists, makeRow, parseAmount, parseDate, makeTxId, normaliseForMatch

/********** MAIN **********/
function runCreditCardImport() {
  const tz = Session.getScriptTimeZone(); // Europe/Helsinki in project settings

  const budgetData = SpreadsheetApp.openById(DATA_SHEET_ID);

  const tabRules = getTabByName(budgetData, TAB_RULES);
  const tabStaging = getTabByName(budgetData, TAB_STAGING);
  const tabReady = getTabByName(budgetData, TAB_READY);
  const tabUnknown = getTabByName(budgetData, TAB_UNKNOWN);
  const tabSkipped = getTabByName(budgetData, TAB_SKIPPED);

  const rules = loadMerchantRules(tabRules); // array, longest-first

  const mapStaging = getHeaders(tabStaging);
  const mapReady = getHeaders(tabReady);
  const mapUnknown = getHeaders(tabUnknown);
  const mapSkipped = getHeaders(tabSkipped);

  // Idempotency: existing tx_ids across all destinations
  const existingTxIds = new Set([
    ...readColumnValues(tabStaging, "tx_id"),
    ...readColumnValues(tabReady, "tx_id"),
    ...readColumnValues(tabSkipped, "tx_id")
  ].filter(Boolean));

  // Unknown merchant index (keyed by normalised merchant string)
  const unknownIdx = loadUnknownMerchantsIndex(tabUnknown, mapUnknown);

  const csvFiles = listStatementCsvFiles(STATEMENTS_FOLDER_ID, READ_ONLY_LATEST_CSV);
  if (csvFiles.length === 0) return;

  const rowsToStaging = [];
  const rowsToReady = [];
  const rowsToSkipped = [];

  for (const file of csvFiles) {
    const csvText = file.getBlob().getDataAsString("UTF-8");
    const { header, records } = parseCsv(csvText);
    if (!header.length) continue;

    const iDate = header.indexOf(CSV_COL_DATE);
    const iMerchant = header.indexOf(CSV_COL_MERCHANT);
    const iAmount = header.indexOf(CSV_COL_AMOUNT);

    if (iDate === -1 || iMerchant === -1 || iAmount === -1) {
      throw new Error(`CSV headers missing. Need: "${CSV_COL_DATE}", "${CSV_COL_MERCHANT}", "${CSV_COL_AMOUNT}"`);
    }

    for (const record of records) {
      const dateRaw = String(record[iDate] || "").trim();
      const merchantRaw = String(record[iMerchant] || "").trim();
      const amountRaw = parseAmount(record[iAmount]);

      if (!dateRaw || !merchantRaw || !isFinite(amountRaw)) continue;

      const txDate = parseDate(dateRaw);
      if (!txDate) continue;

      const txYear = Number(Utilities.formatDate(txDate, tz, "yyyy"));
      if (txYear !== BUDGET_YEAR) continue;

      const dateStr = Utilities.formatDate(txDate, tz, "yyyy-MM-dd");
      const monthStr = Utilities.formatDate(txDate, tz, "yyyy-MM");

      // Amount: statement uses negatives for expenses -> store positive for budgeting totals
      const amountAbs = roundValue(Math.abs(amountRaw));

      // tx_id stable across re-runs
      const txId = makeTxId(`${dateStr}|${merchantRaw}|${amountAbs}|credit_card`);
      if (existingTxIds.has(txId)) continue;
      existingTxIds.add(txId);

      const merchantTrimmed = normaliseForMatch(merchantRaw);
      const merchantRule = findBestRule(merchantTrimmed, rules);

      const nowIso = new Date().toISOString();

      const mode = merchantRule ? merchantRule.mode : "unknown";
      switch (mode) {
        case "skip":
          rowsToSkipped.push(makeRow(mapSkipped, {
            tx_id: txId,
            date: dateStr,
            merchant: merchantRaw,
            amount: amountAbs,
            receipt_id: "",
            verified: false,
            verified_at: ""
          }));
          break;

        case "auto":
          rowsToReady.push(makeRow(mapReady, {
            tx_id: txId,
            date: dateStr,
            month: monthStr,
            merchant: merchantRaw,
            amount: amountAbs,
            group: merchantRule.group || "",
            category: merchantRule.category || "",
            posted_at: nowIso
          }));
          break;

        case "review":
          rowsToStaging.push(makeRow(mapStaging, {
            tx_id: txId,
            date: dateStr,
            merchant: merchantRaw,
            amount: amountAbs,
            rule_mode: "review",
            group: merchantRule.group || "",
            category: merchantRule.category || "",
            posted_at: "",
            status: STATUS_NEEDS_REVIEW
          }));
          break;

        default:
          rowsToStaging.push(makeRow(mapStaging, {
            tx_id: txId,
            date: dateStr,
            merchant: merchantRaw,
            amount: amountAbs,
            rule_mode: "unknown",
            group: "",
            category: "",
            posted_at: "",
            status: STATUS_BLOCKED
          }));
          upsertUnknownMerchant(unknownIdx, merchantTrimmed, merchantRaw, dateStr);
      }
    }
  }

  if (rowsToReady.length) appendRows(tabReady, rowsToReady);
  if (rowsToStaging.length) appendRows(tabStaging, rowsToStaging);
  if (rowsToSkipped.length) appendRows(tabSkipped, rowsToSkipped);

  flushUnknownMerchants(tabUnknown, mapUnknown, unknownIdx);
}

/* exported approveItemStagingEntries */

// Import utilities from organized core modules
const { normaliseForMatch } = require("../../core/parsers/data");
const { toIso, toMonth } = require("../../core/utilities");

/**
 * Item Approval Script (Apps Script)
 *
 * What it does:
 * - Runs daily (via trigger) to process manually categorized receipt_staging entries
 * - Finds entries where group AND category are filled in (manually added)
 * - Validates against categories sheet (group + category must exist after normalization)
 * - If valid:
 *   - Creates row in transactions_ready
 *   - Updates staging row: posted_at = timestamp, status = APPROVED
 * - If invalid (category/group doesn't match):
 *   - Updates staging row: status = ERROR
 *
 * Note: This approves individual ITEMS from receipts, not whole receipts.
 *       Receipt verification (confirming whole receipt accuracy) is a separate process.
 *
 * Requirements:
 * - categories sheet must exist with columns: group, category, subcategory, active
 * - receipt_staging must have entries with manually filled group and category
 */

/**
 * Entry point: processes receipt_staging entries with manual categorization.
 * Safe to run multiple times - only processes entries with status NEEDS_REVIEW or NEEDS_RULE.
 *
 * @param {string} testSpreadsheetId - Optional spreadsheet ID for E2E testing
 */
function _approveItemStagingEntries(testSpreadsheetId) {
  const ss = testSpreadsheetId
    ? SpreadsheetApp.openById(testSpreadsheetId)
    : SpreadsheetApp.getActive();

  const stagingSheet = ss.getSheetByName(TAB_RECEIPT_STAGING);
  const readySheet = ss.getSheetByName(TAB_TRANSACTIONS_READY);
  const categoriesSheet = ss.getSheetByName(TAB_CATEGORIES);

  if (!stagingSheet || !readySheet || !categoriesSheet) {
    var errs = require("../core/errors");
    throw new errs.WorkflowError(
      "Missing required sheets. Ensure receipt_staging, transactions_ready, and categories exist.",
      "MISSING_SHEETS",
    );
  }

  // Load valid categories (group + category combinations)
  const validCategories = loadValidCategories(categoriesSheet);

  // Get staging data
  const stagingData = stagingSheet.getDataRange().getValues();
  if (stagingData.length < 2) {
    Logger.log("No staging entries to process.");
    return;
  }

  const headers = stagingData[0].map((h) => String(h).trim().toLowerCase());
  const colIndex = (name) => headers.indexOf(name);

  const iTxId = colIndex("tx_id");
  const iDate = colIndex("date");
  const iReceiptId = colIndex("receipt_id");
  const iMerchant = colIndex("merchant");
  const iAmount = colIndex("amount");
  const iGroup = colIndex("group");
  const iCategory = colIndex("category");
  const iPostedAt = colIndex("posted_at");
  const iStatus = colIndex("status");

  const nowIso = toIso(new Date());
  let approved = 0;
  let errors = 0;

  // Process rows (skip header)
  for (let r = 1; r < stagingData.length; r++) {
    const row = stagingData[r];
    const status = String(row[iStatus] || "").trim();

    // Only process entries awaiting review/rule
    if (status !== STATUS_NEEDS_REVIEW && status !== STATUS_NEEDS_RULE) {
      continue;
    }

    const group = String(row[iGroup] || "").trim();
    const category = String(row[iCategory] || "").trim();

    // Skip if group or category is empty (not yet manually categorized)
    if (!group || !category) {
      continue;
    }

    const rowNum = r + 1; // 1-based row number for sheet operations

    // Validate against categories sheet
    const normalizedKey = `${normaliseForMatch(group)}|${normaliseForMatch(category)}`;

    if (!validCategories.has(normalizedKey)) {
      // Invalid category/group combination
      stagingSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_ERROR);
      errors++;
      Logger.log(`Row ${rowNum}: Invalid group/category: "${group}" / "${category}"`);
      continue;
    }

    // Get the canonical (original) names from categories sheet
    const canonical = validCategories.get(normalizedKey);

    // Mark staging row as processing to avoid duplicate side-effects, flush, then create transactions_ready row
    stagingSheet.getRange(rowNum, iStatus + 1).setValue("PROCESSING");
    if (typeof ss.flush === "function") ss.flush();

    // Create transactions_ready row
    const txId = String(row[iTxId] || "");
    const date = String(row[iDate] || "");
    const month = toMonth(date);
    const merchant = String(row[iMerchant] || "");
    const amount = row[iAmount] ?? "";
    const receiptId = String(row[iReceiptId] || "");

    readySheet.appendRow([
      txId,
      date,
      month,
      merchant,
      amount,
      canonical.group, // Use canonical name from categories
      canonical.category, // Use canonical name from categories
      nowIso,
      `receipt:${receiptId}`,
    ]);

    // Update staging row: posted_at and status
    stagingSheet.getRange(rowNum, iPostedAt + 1).setValue(nowIso);
    stagingSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_APPROVED);
    approved++;
  }

  Logger.log(`Approved ${approved} entries, ${errors} errors.`);
}

function approveItemStagingEntries(testSpreadsheetId) {
  const { handleWorkflowErrors } = require("../../core/error_handler");
  return handleWorkflowErrors('ItemApproval', {}, () => {
    _approveItemStagingEntries(testSpreadsheetId);
    return { success: true };
  });
}

/**
 * Load valid category combinations from categories sheet.
 * Returns a Map with normalized "group|category" keys and canonical names.
 * Only includes active categories.
 */
function loadValidCategories(categoriesSheet) {
  const data = categoriesSheet.getDataRange().getValues();
  if (data.length < 2) return new Map();

  const headers = data[0].map((h) => String(h).trim().toLowerCase());
  const colIndex = (name) => headers.indexOf(name);

  const iGroup = colIndex("group");
  const iCategory = colIndex("category");
  const iActive = colIndex("active");

  const validMap = new Map();

  for (let r = 1; r < data.length; r++) {
    const row = data[r];

    // Skip inactive categories
    if (iActive !== -1 && row[iActive] !== true) {
      continue;
    }

    const group = String(row[iGroup] || "").trim();
    const category = String(row[iCategory] || "").trim();

    if (!group || !category) continue;

    const normalizedKey = `${normaliseForMatch(group)}|${normaliseForMatch(category)}`;

    // Store canonical names (first occurrence wins if duplicates exist)
    if (!validMap.has(normalizedKey)) {
      validMap.set(normalizedKey, { group, category });
    }
  }

  return validMap;
}

/* exported approveUnknownItems */

// Import utilities from organized core modules
const { normaliseForMatch } = require("../../core/parsers/data");
const { toIso } = require("../../core/utilities");

/**
 * Unknown Items Approval Script (Apps Script)
 *
 * What it does:
 * - Runs daily (via trigger) to process manually categorized unknown_items entries
 * - Finds entries where group, category, AND mode are filled in
 * - Validates against categories sheet (group + category must exist after normalization)
 * - If valid:
 *   - Creates rule in item_rules
 *   - Updates unknown_items row: status = APPROVED
 * - If invalid (category/group doesn't match):
 *   - Updates unknown_items row: status = ERROR
 *
 * Requirements:
 * - categories sheet must exist with columns: group, category, subcategory, active
 * - unknown_items must have entries with manually filled group, category, and mode
 */

/**
 * Entry point: processes unknown_items entries with manual categorization.
 * Safe to run multiple times - only processes entries with status NEEDS_REVIEW.
 *
 * @param {string} testSpreadsheetId - Optional spreadsheet ID for E2E testing
 */
function _approveUnknownItems(testSpreadsheetId) {
  const ss = testSpreadsheetId
    ? SpreadsheetApp.openById(testSpreadsheetId)
    : SpreadsheetApp.getActive();

  const unknownSheet = ss.getSheetByName(TAB_UNKNOWN_ITEMS);
  const rulesSheet = ss.getSheetByName(TAB_ITEM_RULES);
  const categoriesSheet = ss.getSheetByName(TAB_CATEGORIES);

  if (!unknownSheet || !rulesSheet || !categoriesSheet) {
    var errs = require("../core/errors");
    throw new errs.WorkflowError(
      "Missing required sheets. Ensure unknown_items, item_rules, and categories exist.",
      "MISSING_SHEETS",
    );
  }

  // Load valid categories (group + category combinations)
  const validCategories = loadValidCategoriesForUnknown(categoriesSheet);

  // Load existing rules to avoid duplicates
  const existingPatterns = loadExistingPatterns(rulesSheet);

  // Get unknown_items data
  const unknownData = unknownSheet.getDataRange().getValues();
  if (unknownData.length < 2) {
    Logger.log("No unknown items to process.");
    return;
  }

  const headers = unknownData[0].map((h) => String(h).trim().toLowerCase());
  const colIndex = (name) => headers.indexOf(name);

  const iPattern = colIndex("pattern");
  const iGroup = colIndex("group");
  const iCategory = colIndex("category");
  const iMode = colIndex("mode");
  const iStatus = colIndex("status");

  let approved = 0;
  let errors = 0;
  let skippedDuplicate = 0;

  // Process rows (skip header)
  for (let r = 1; r < unknownData.length; r++) {
    const row = unknownData[r];
    const status = String(row[iStatus] || "").trim();

    // Only process entries awaiting review
    if (status !== STATUS_NEEDS_REVIEW) {
      continue;
    }

    const pattern = String(row[iPattern] || "").trim();
    const group = String(row[iGroup] || "").trim();
    const category = String(row[iCategory] || "").trim();
    const mode = String(row[iMode] || "")
      .trim()
      .toLowerCase();

    // Skip if group, category, or mode is empty (not yet manually categorized)
    if (!pattern || !group || !category || !mode) {
      continue;
    }

    const rowNum = r + 1; // 1-based row number for sheet operations

    // Check if pattern already exists in rules
    const normalizedPattern = normaliseForMatch(pattern);
    if (existingPatterns.has(normalizedPattern)) {
      // Pattern already exists, mark as approved (rule exists)
      unknownSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_APPROVED);
      skippedDuplicate++;
      Logger.log(`Row ${rowNum}: Pattern "${pattern}" already exists in rules, marked approved.`);
      continue;
    }

    // Validate against categories sheet
    const normalizedKey = `${normaliseForMatch(group)}|${normaliseForMatch(category)}`;

    if (!validCategories.has(normalizedKey)) {
      // Invalid category/group combination
      unknownSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_ERROR);
      errors++;
      Logger.log(`Row ${rowNum}: Invalid group/category: "${group}" / "${category}"`);
      continue;
    }

    // Get the canonical (original) names from categories sheet
    const canonical = validCategories.get(normalizedKey);

    // Validate mode
    if (mode !== MODE_AUTO && mode !== MODE_REVIEW && mode !== MODE_SKIP) {
      unknownSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_ERROR);
      errors++;
      Logger.log(`Row ${rowNum}: Invalid mode: "${mode}" (must be auto, review, or skip)`);
      continue;
    }

    // Mark row as processing to avoid duplicate side-effects, flush, then create item_rules row
    unknownSheet.getRange(rowNum, iStatus + 1).setValue("PROCESSING");
    if (typeof ss.flush === "function") ss.flush();

    // Create item_rules row
    rulesSheet.appendRow([
      pattern,
      canonical.group, // Use canonical name from categories
      canonical.category, // Use canonical name from categories
      mode,
    ]);

    // Add to existing patterns to prevent duplicates within this run
    existingPatterns.add(normalizedPattern);

    // Update unknown_items row: status
    unknownSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_APPROVED);
    approved++;
  }

  Logger.log(
    `Approved ${approved} items, ${errors} errors, ${skippedDuplicate} already had rules.`,
  );
}

function approveUnknownItems(testSpreadsheetId) {
  const { handleWorkflowErrors } = require("../../core/error_handler");
  return handleWorkflowErrors('UnknownItemsApproval', {}, () => {
    _approveUnknownItems(testSpreadsheetId);
    return { success: true };
  });
}

/**
 * Load valid category combinations from categories sheet.
 * Returns a Map with normalized "group|category" keys and canonical names.
 * Only includes active categories.
 */
function loadValidCategoriesForUnknown(categoriesSheet) {
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

/**
 * Load existing patterns from item_rules sheet.
 * Returns a Set of normalized patterns.
 */
function loadExistingPatterns(rulesSheet) {
  const data = rulesSheet.getDataRange().getValues();
  if (data.length < 2) return new Set();

  const headers = data[0].map((h) => String(h).trim().toLowerCase());
  const iPattern = headers.indexOf("pattern");

  const patterns = new Set();

  for (let r = 1; r < data.length; r++) {
    const pattern = String(data[r][iPattern] || "").trim();
    if (pattern) {
      patterns.add(normaliseForMatch(pattern));
    }
  }

  return patterns;
}

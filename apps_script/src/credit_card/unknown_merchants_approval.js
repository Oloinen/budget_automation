/* exported approveUnknownMerchants */
/**
 * Unknown Merchants Approval Script (Apps Script)
 *
 * What it does:
 * - Runs daily (via trigger) to process manually categorized unknown_merchants entries
 * - Finds entries where group, category, AND mode are filled in
 * - Validates against categories sheet (group + category must exist after normalization)
 * - If valid:
 *   - Creates rule in merchant_rules
 *   - Updates unknown_merchants row: status = APPROVED
 * - If invalid (category/group doesn't match):
 *   - Updates unknown_merchants row: status = ERROR
 *
 * Requirements:
 * - categories sheet must exist with columns: group, category, subcategory, active
 * - unknown_merchants must have entries with manually filled group, category, and mode
 */

// Helpers used from utils.js: normaliseForMatch, toIso

/**
 * Entry point: processes unknown_merchants entries with manual categorization.
 * Safe to run multiple times - only processes entries with status NEEDS_REVIEW.
 *
 * @param {string} testSpreadsheetId - Optional spreadsheet ID for E2E testing
 */
function approveUnknownMerchants(testSpreadsheetId) {
  const ss = testSpreadsheetId
    ? SpreadsheetApp.openById(testSpreadsheetId)
    : SpreadsheetApp.getActive();

  const unknownSheet = ss.getSheetByName(TAB_MERCHANTS_UNKNOWN);
  const rulesSheet = ss.getSheetByName(TAB_MERCHANT_RULES);
  const categoriesSheet = ss.getSheetByName(TAB_CATEGORIES);

  if (!unknownSheet || !rulesSheet || !categoriesSheet) {
    Logger.log(
      "Missing required sheets. Ensure unknown_merchants, merchant_rules, and categories exist.",
    );
    return;
  }

  // Load valid categories (group + category combinations)
  const validCategories = loadValidCategoriesForUnknown(categoriesSheet);

  // Load existing rules to avoid duplicates
  const existingMerchants = loadExistingMerchants(rulesSheet);

  // Get unknown_merchants data
  const unknownData = unknownSheet.getDataRange().getValues();
  if (unknownData.length < 2) {
    Logger.log("No unknown merchants to process.");
    return;
  }

  const headers = unknownData[0].map((h) => String(h).trim().toLowerCase());
  const colIndex = (name) => headers.indexOf(name);

  const iMerchant = colIndex("merchant");
  const iGroup = colIndex("group");
  const iCategory = colIndex("category");
  const iMode = colIndex("mode");
  const iStatus = colIndex("status");

  const nowIso = toIso(new Date());
  let approved = 0;
  let errors = 0;
  let skipped = 0;

  // Process rows (skip header)
  for (let r = 1; r < unknownData.length; r++) {
    const row = unknownData[r];
    const status = String(row[iStatus] || "").trim();

    // Only process entries awaiting review
    if (status !== STATUS_NEEDS_REVIEW) {
      continue;
    }

    const merchant = String(row[iMerchant] || "").trim();
    const group = String(row[iGroup] || "").trim();
    const category = String(row[iCategory] || "").trim();
    const mode = String(row[iMode] || "").trim();

    // Skip if merchant or mode is empty
    if (!merchant || !mode) {
      continue;
    }

    const rowNum = r + 1; // 1-based row number for sheet operations

    // Check for duplicate rule
    const merchantNormalized = normaliseForMatch(merchant);
    if (existingMerchants.has(merchantNormalized)) {
      unknownSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_ERROR);
      errors++;
      Logger.log(`Row ${rowNum}: Merchant rule already exists: "${merchant}"`);
      continue;
    }

    // Validate mode
    if (mode !== MODE_AUTO && mode !== MODE_REVIEW && mode !== MODE_SKIP) {
      unknownSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_ERROR);
      errors++;
      Logger.log(
        `Row ${rowNum}: Invalid mode: "${mode}". Must be "${MODE_AUTO}", "${MODE_REVIEW}", or "${MODE_SKIP}"`,
      );
      continue;
    }

    // Validate against categories sheet (skip for mode=skip)
    if (mode !== MODE_SKIP) {
      // For non-skip modes, require group and category
      if (!group || !category) {
        unknownSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_ERROR);
        errors++;
        Logger.log(`Row ${rowNum}: Group and category required for mode "${mode}"`);
        continue;
      }

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

      // Create merchant_rules row with canonical names
      rulesSheet.appendRow([merchant, canonical.group, canonical.category, mode]);
    } else {
      // For skip mode, use provided group/category (can be empty)
      rulesSheet.appendRow([merchant, group, category, mode]);
    }

    // Mark as approved
    existingMerchants.add(merchantNormalized);
    unknownSheet.getRange(rowNum, iStatus + 1).setValue(STATUS_APPROVED);
    approved++;
  }

  Logger.log(`Approved ${approved} merchants, ${errors} errors, ${skipped} skipped.`);
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
 * Load existing merchant rules to avoid creating duplicates.
 * Returns a Set of normalized merchant names.
 */
function loadExistingMerchants(rulesSheet) {
  const data = rulesSheet.getDataRange().getValues();
  if (data.length < 2) return new Set();

  const headers = data[0].map((h) => String(h).trim().toLowerCase());
  const colIndex = (name) => headers.indexOf(name);

  const iMerchant = colIndex("merchant");
  if (iMerchant === -1) return new Set();

  const merchants = new Set();

  for (let r = 1; r < data.length; r++) {
    const merchant = String(data[r][iMerchant] || "").trim();
    if (merchant) {
      merchants.add(normaliseForMatch(merchant));
    }
  }

  return merchants;
}

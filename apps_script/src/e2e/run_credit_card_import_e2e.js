/* exported runCreditCardImportE2E */
function runCreditCardImportE2E(testSpreadsheetId, testBudgetYear) {
  // Optional override: set global CONFIG values so existing code uses the test spreadsheet/year.
  this.CONFIG = this.CONFIG || {};
  if (testSpreadsheetId) this.CONFIG.TEST_SPREADSHEET_ID = testSpreadsheetId;
  if (testBudgetYear) this.CONFIG.BUDGET_YEAR = Number(testBudgetYear);

  // Ensure the test spreadsheet has required sheets and minimal headers so import won't fail.
  try {
    if (testSpreadsheetId) {
      var ss = SpreadsheetApp.openById(testSpreadsheetId);
      var ensureSheet = function (name, headers) {
        var s = ss.getSheetByName(name);
        if (!s) s = ss.insertSheet(name);
        var range = s.getRange(1, 1, 1, headers.length);
        range.setValues([headers]);
      };

      // Minimal headers — adjust if your import expects different columns
      ensureSheet(CONFIG.TAB_MERCHANT_RULES || "merchant_rules", ["pattern", "mode", "category"]);
      ensureSheet(CONFIG.TAB_CC_STAGING || "credit_card_staging", [
        "Date",
        "Merchant",
        "Amount",
        "status",
        "rule_mode",
        "txId",
      ]);
      ensureSheet(CONFIG.TAB_CC_READY || "credit_card_ready", [
        "Date",
        "Merchant",
        "Amount",
        "txId",
      ]);
      ensureSheet(CONFIG.TAB_CC_SKIPPED || "credit_card_skipped", [
        "Date",
        "Merchant",
        "Amount",
        "reason",
      ]);
      ensureSheet(CONFIG.TAB_MERCHANTS_UNKNOWN || "unknown_merchants", [
        "merchantName",
        "firstSeen",
      ]);
    }
  } catch (e) {
    return { success: false, error: "Failed to prepare test spreadsheet: " + String(e) };
  }

  try {
    if (typeof runCreditCardImport !== "function") {
      return { success: false, error: "runCreditCardImport() not found in project" };
    }

    var result = runCreditCardImport(testSpreadsheetId);

    // Gather useful sheet outputs from the test spreadsheet (if id provided)
    var outputs = {};
    if (testSpreadsheetId) {
      try {
        var ss2 = SpreadsheetApp.openById(testSpreadsheetId);
        var getValues = function (name) {
          var s = ss2.getSheetByName(name);
          return s ? s.getDataRange().getValues() : null;
        };
        outputs.unknowns =
          getValues(CONFIG.TAB_MERCHANTS_UNKNOWN) ||
          getValues("Unknown merchants") ||
          getValues("Unknown");
        outputs.staging =
          getValues(CONFIG.TAB_CC_STAGING) || getValues("Staging") || getValues("staged");
        outputs.ready = getValues(CONFIG.TAB_CC_READY) || getValues("Ready") || getValues("ready");
      } catch (e) {
        outputs.error = "Failed to open test spreadsheet after run: " + String(e);
      }
    }

    return { success: true, result: result, outputs: outputs };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

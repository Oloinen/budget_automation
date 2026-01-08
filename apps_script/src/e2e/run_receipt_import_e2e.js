/* exported runReceiptImportE2E */
function runReceiptImportE2E(testSpreadsheetId, testFolderId) {
  // Optional override: set global CONFIG values so existing code uses the test spreadsheet/folder.
  this.CONFIG = this.CONFIG || {};
  if (testSpreadsheetId) this.CONFIG.TEST_SPREADSHEET_ID = testSpreadsheetId;
  if (testFolderId) this.CONFIG.TEST_RECEIPTS_FOLDER_ID = testFolderId;

  // Ensure the test spreadsheet has required sheets and minimal headers
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
      ensureSheet(CONFIG.TAB_ITEM_RULES || "item_rules", ["pattern", "mode", "group", "category"]);
      ensureSheet(CONFIG.TAB_RECEIPT_STAGING || "receipt_staging", [
        "tx_id",
        "date",
        "merchant",
        "item_description",
        "amount",
        "group",
        "category",
        "status",
        "receipt_id",
      ]);
      ensureSheet(CONFIG.TAB_TRANSACTIONS_READY || "transactions_ready", [
        "tx_id",
        "date",
        "merchant",
        "amount",
        "group",
        "category",
        "source",
      ]);
      ensureSheet(CONFIG.TAB_UNKNOWN_ITEMS || "unknown_items", [
        "item_pattern",
        "first_seen",
        "last_seen",
        "count",
      ]);
      ensureSheet(CONFIG.TAB_RECEIPT_FILES || "receipt_files", [
        "file_id",
        "file_name",
        "processed_at",
        "status",
        "merchant",
        "date",
        "total",
      ]);
    }
  } catch (e) {
    return { success: false, error: "Failed to prepare test spreadsheet: " + String(e) };
  }

  try {
    if (typeof importReceiptsFromFolder !== "function") {
      return { success: false, error: "importReceiptsFromFolder() not found in project" };
    }

    // Override the folder ID temporarily if test folder provided
    var originalFolderId = this.RECEIPTS_FOLDER_ID;
    if (testFolderId) {
      this.RECEIPTS_FOLDER_ID = testFolderId;
    }

    var result = importReceiptsFromFolder();

    // Restore original folder ID
    if (testFolderId && originalFolderId) {
      this.RECEIPTS_FOLDER_ID = originalFolderId;
    }

    // Gather useful sheet outputs from the test spreadsheet
    var outputs = {};
    if (testSpreadsheetId) {
      try {
        var ss2 = SpreadsheetApp.openById(testSpreadsheetId);
        var getValues = function (name) {
          var s = ss2.getSheetByName(name);
          return s ? s.getDataRange().getValues() : null;
        };
        outputs.unknownItems = getValues(CONFIG.TAB_UNKNOWN_ITEMS) || getValues("unknown_items");
        outputs.staging = getValues(CONFIG.TAB_RECEIPT_STAGING) || getValues("receipt_staging");
        outputs.ready = getValues(CONFIG.TAB_TRANSACTIONS_READY) || getValues("transactions_ready");
        outputs.files = getValues(CONFIG.TAB_RECEIPT_FILES) || getValues("receipt_files");
      } catch (e) {
        outputs.error = "Failed to read test spreadsheet after run: " + String(e);
      }
    }

    return { success: true, result: result, outputs: outputs };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

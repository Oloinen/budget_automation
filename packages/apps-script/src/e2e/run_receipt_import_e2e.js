/* exported runReceiptImportE2E */
const { getReceiptsFolderId, setReceiptsFolderId, schema } = require("../core/runtime-ids");
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
      ensureSheet(CONFIG.TAB_ITEM_RULES || schema.TAB_ITEM_RULES || "item_rules", [
        "pattern",
        "mode",
        "group",
        "category",
      ]);
      ensureSheet(CONFIG.TAB_RECEIPT_STAGING || schema.TAB_RECEIPT_STAGING || "receipt_staging", [
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
      ensureSheet(
        CONFIG.TAB_TRANSACTIONS_READY || schema.TAB_TRANSACTIONS_READY || "transactions_ready",
        ["tx_id", "date", "merchant", "amount", "group", "category", "source"],
      );
      ensureSheet(CONFIG.TAB_UNKNOWN_ITEMS || schema.TAB_UNKNOWN_ITEMS || "unknown_items", [
        "item_pattern",
        "first_seen",
        "last_seen",
        "count",
      ]);
      ensureSheet(CONFIG.TAB_RECEIPT_FILES || schema.TAB_RECEIPT_FILES || "receipt_files", [
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
    var errs = require("../core/errors");
    throw new errs.WorkflowError(
      "Failed to prepare test spreadsheet: " + String(e),
      "PREPARE_TEST_FAILED",
      { original: e },
    );
  }

  try {
    if (typeof importReceiptsFromFolder !== "function") {
      var errs2 = require("../core/errors");
      throw new errs2.WorkflowError(
        "importReceiptsFromFolder() not found in project",
        "MISSING_FUNCTION",
      );
    }

    // Override the folder ID temporarily if test folder provided
    var originalFolderId =
      typeof getReceiptsFolderId === "function" ? getReceiptsFolderId() : this.RECEIPTS_FOLDER_ID;
    if (testFolderId) {
      if (typeof setReceiptsFolderId === "function") setReceiptsFolderId(testFolderId);
      else this.RECEIPTS_FOLDER_ID = testFolderId;
    }

    var result = importReceiptsFromFolder();

    // Restore original folder ID
    if (testFolderId) {
      if (typeof setReceiptsFolderId === "function") setReceiptsFolderId(originalFolderId);
      else this.RECEIPTS_FOLDER_ID = originalFolderId;
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
        outputs.unknownItems =
          getValues(CONFIG.TAB_UNKNOWN_ITEMS || schema.TAB_UNKNOWN_ITEMS) ||
          getValues("unknown_items");
        outputs.staging =
          getValues(CONFIG.TAB_RECEIPT_STAGING || schema.TAB_RECEIPT_STAGING) ||
          getValues("receipt_staging");
        outputs.ready =
          getValues(CONFIG.TAB_TRANSACTIONS_READY || schema.TAB_TRANSACTIONS_READY) ||
          getValues("transactions_ready");
        outputs.files =
          getValues(CONFIG.TAB_RECEIPT_FILES || schema.TAB_RECEIPT_FILES) ||
          getValues("receipt_files");
      } catch (e) {
        outputs.error = "Failed to read test spreadsheet after run: " + String(e);
      }
    }

    return { success: true, result: result, outputs: outputs };
  } catch (err) {
    var errs3 = require("../core/errors");
    if (err instanceof errs3.WorkflowError) throw err;
    throw new errs3.WorkflowError(String(err), "EXECUTION_ERROR", { original: err });
  }
}

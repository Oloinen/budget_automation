/**
 * Runtime ID management for Apps Script resources.
 *
 * Provides getters/setters for runtime resource IDs (sheet IDs, folder IDs, URLs).
 * IDs are read from Script Properties or process.env, with optional in-memory overrides for testing.
 */

const { getScriptProperty } = require("./config/properties");
const schema = require("../../../shared/schema");

// Runtime overrides (in-memory) used by tests/E2E to temporarily set IDs
const runtimeOverrides = {};

function getBudgetDataSheetId() {
  return runtimeOverrides.BUDGET_DATA_SHEET_ID || getScriptProperty("BUDGET_DATA_SHEET_ID");
}

function setBudgetDataSheetId(id) {
  runtimeOverrides.BUDGET_DATA_SHEET_ID = id;
}

function getCreditCardStatementsFolderId() {
  return (
    runtimeOverrides.CREDIT_CARD_STATEMENTS_FOLDER_ID ||
    getScriptProperty("CREDIT_CARD_STATEMENTS_FOLDER_ID")
  );
}

function setCreditCardStatementsFolderId(id) {
  runtimeOverrides.CREDIT_CARD_STATEMENTS_FOLDER_ID = id;
}

function getReceiptsFolderId() {
  return runtimeOverrides.RECEIPTS_FOLDER_ID || getScriptProperty("RECEIPTS_FOLDER_ID");
}

function setReceiptsFolderId(id) {
  runtimeOverrides.RECEIPTS_FOLDER_ID = id;
}

function getReceiptExtractorUrl() {
  return runtimeOverrides.RECEIPT_EXTRACTOR_URL || getScriptProperty("RECEIPT_EXTRACTOR_URL");
}

function setReceiptExtractorUrl(url) {
  runtimeOverrides.RECEIPT_EXTRACTOR_URL = url;
}

// Export getters/setters and schema object for Node/Jest
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getBudgetDataSheetId,
    setBudgetDataSheetId,
    getCreditCardStatementsFolderId,
    setCreditCardStatementsFolderId,
    getReceiptsFolderId,
    setReceiptsFolderId,
    getReceiptExtractorUrl,
    setReceiptExtractorUrl,
    schema,
  };
}

// Attach getters/setters as globals for Apps Script runtime convenience
if (typeof this !== "undefined") {
  try {
    this.getBudgetDataSheetId = getBudgetDataSheetId;
    this.setBudgetDataSheetId = setBudgetDataSheetId;
    this.getCreditCardStatementsFolderId = getCreditCardStatementsFolderId;
    this.setCreditCardStatementsFolderId = setCreditCardStatementsFolderId;
    this.getReceiptsFolderId = getReceiptsFolderId;
    this.setReceiptsFolderId = setReceiptsFolderId;
    this.getReceiptExtractorUrl = getReceiptExtractorUrl;
    this.setReceiptExtractorUrl = setReceiptExtractorUrl;
  } catch (err) {
    // ignore
  }
}

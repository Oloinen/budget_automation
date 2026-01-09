// Local config overrides for development.
// Do NOT commit production secrets. This file is intended for local dev only.

module.exports = {
  // Example overrides:
  NOTIFY_EMAIL: "dev@example.com",
  ALLOW_PRODUCTION_COPY: "false",
  RECEIPT_EXTRACTOR_URL: "http://localhost:8080/extract",
};

// If running in Node and config getters/setters are available, set runtime overrides
try {
  // require the core config module relative to this file
  const cfg = require("./config");
  if (cfg && typeof cfg.setBudgetDataSheetId === "function") {
    cfg.setBudgetDataSheetId("PUT_BUDGET_DATA_SPREADSHEET_ID_HERE");
  }
  if (cfg && typeof cfg.setCreditCardStatementsFolderId === "function") {
    cfg.setCreditCardStatementsFolderId("PUT_DRIVE_FOLDER_ID_WITH_STATEMENTS_HERE");
  }
  if (cfg && typeof cfg.setReceiptsFolderId === "function") {
    cfg.setReceiptsFolderId("PUT_RECEIPTS_FOLDER_ID_HERE");
  }
  if (cfg && typeof cfg.setReceiptExtractorUrl === "function") {
    cfg.setReceiptExtractorUrl(
      "https://europe-north1-budget-automation-483211.cloudfunctions.net/receipt-extractor",
    );
  }
} catch (err) {
  // ignore when not running in Node or config module not available
}

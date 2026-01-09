/**
 * Entry points for Google Apps Script.
 * These are the functions that Apps Script can call directly.
 */

// Credit Card Workflows
const { runCreditCardImport } = require("../workflows/credit-card/credit_card_import");
const { approveMerchantStagingEntries } = require("../workflows/credit-card/merchant_approval");
const { approveUnknownMerchants } = require("../workflows/credit-card/unknown_merchants_approval");

// Receipt Workflows
const { importReceiptsFromFolder } = require("../workflows/receipts/receipt_import");
const { approveItemStagingEntries } = require("../workflows/receipts/item_approval");
const { approveUnknownItems } = require("../workflows/receipts/unknown_items_approval");

// Budget
const { createBudget } = require("../workflows/budget/create_budget");

// Triggers
const { setupDailyImports } = require("../triggers/scheduled");

// Export all entrypoints
/* exported 
  runCreditCardImport,
  approveMerchantStagingEntries,
  approveUnknownMerchants,
  importReceiptsFromFolder,
  approveItemStagingEntries,
  approveUnknownItems,
  createBudget,
  setupDailyImports
*/

// Re-export for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    runCreditCardImport,
    approveMerchantStagingEntries,
    approveUnknownMerchants,
    importReceiptsFromFolder,
    approveItemStagingEntries,
    approveUnknownItems,
    createBudget,
    setupDailyImports,
  };
}

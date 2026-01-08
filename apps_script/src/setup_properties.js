/* exported setupScriptProperties, viewScriptProperties, clearScriptProperties, updateScriptProperty */
/**
 * Setup Script Properties for Budget Automation
 *
 * Run this function ONCE in the Apps Script editor to configure your IDs.
 * After running, the sensitive IDs are stored securely in Script Properties
 * and are NOT visible in the source code.
 *
 * Usage:
 * 1. Open the Apps Script editor
 * 2. Replace the placeholder values below with your actual IDs
 * 3. Run setupScriptProperties() once
 * 4. Delete or revert this file (don't commit real IDs)
 *
 * To view current properties: Run viewScriptProperties()
 * To clear all properties: Run clearScriptProperties()
 */

/**
 * Set up all required script properties.
 * IMPORTANT: Replace placeholder values before running!
 */
function setupScriptProperties() {
  var props = PropertiesService.getScriptProperties();

  props.setProperties({
    BUDGET_DATA_SHEET_ID: "YOUR_SPREADSHEET_ID_HERE",
    CREDIT_CARD_STATEMENTS_FOLDER_ID: "YOUR_CC_FOLDER_ID_HERE",
    RECEIPTS_FOLDER_ID: "YOUR_RECEIPTS_FOLDER_ID_HERE",
    RECEIPT_EXTRACTOR_URL: "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/receipt-extractor",
  });

  Logger.log("Script properties configured successfully!");
  Logger.log("");
  Logger.log("Current values:");
  viewScriptProperties();
}

/**
 * View all current script properties (for debugging).
 */
function viewScriptProperties() {
  var props = PropertiesService.getScriptProperties().getProperties();

  for (var key in props) {
    // Mask the values for security (show first 4 and last 4 chars)
    var value = props[key];
    var masked =
      value.length > 10
        ? value.substring(0, 4) + "..." + value.substring(value.length - 4)
        : "****";
    Logger.log(key + ": " + masked);
  }
}

/**
 * Clear all script properties (use with caution!).
 */
function clearScriptProperties() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  Logger.log("⚠️ All script properties have been cleared.");
}

/**
 * Update a single property.
 * @param {string} key - Property name
 * @param {string} value - Property value
 */
function updateScriptProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
  Logger.log("Updated " + key);
}

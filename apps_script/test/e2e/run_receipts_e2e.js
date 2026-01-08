#!/usr/bin/env node
/**
 * Receipts E2E Test Suite
 *
 * Tests receipt workflows:
 * 1. Receipt import (optional - requires Cloud Function)
 * 2. Item approval
 * 3. Unknown items approval
 *
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_JSON='{"type":"service_account",...}' \
 *   APPS_SCRIPT_ID=xxx \
 *   TEST_TEMPLATE_SHEET_ID=xxx \
 *   TEST_FOLDER_ID=xxx \
 *   TEST_RECEIPTS_FOLDER_ID=xxx \
 *   node test/e2e/run_receipts_e2e.js
 */

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const {
  seedTestData,
  seedReceiptStagingEntries,
  seedUnknownItems,
  seedItemRules,
} = require("./seed_test_data");

// Configuration from environment
const CONFIG = {
  scriptId: process.env.APPS_SCRIPT_ID,
  templateSheetId: process.env.TEST_TEMPLATE_SHEET_ID,
  testFolderId: process.env.TEST_FOLDER_ID,
  testReceiptsFolderId: process.env.TEST_RECEIPTS_FOLDER_ID,
  keyJson: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON,
};

// Validate required env vars
function validateConfig() {
  const missing = [];
  if (!CONFIG.scriptId) missing.push("APPS_SCRIPT_ID");
  if (!CONFIG.templateSheetId) missing.push("TEST_TEMPLATE_SHEET_ID");
  if (!CONFIG.testFolderId) missing.push("TEST_FOLDER_ID");
  if (!CONFIG.keyJson) missing.push("GOOGLE_SERVICE_ACCOUNT_KEY_JSON");

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:", missing.join(", "));
    process.exit(1);
  }
}

// Google API clients
let auth, sheets, drive, script;

async function setupClients() {
  console.log("🔧 Setting up Google API clients...");

  const credentials = JSON.parse(CONFIG.keyJson);
  auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/script.projects",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  const client = await auth.getClient();
  sheets = google.sheets({ version: "v4", auth: client });
  drive = google.drive({ version: "v3", auth: client });
  script = google.script({ version: "v1", auth: client });

  console.log("✅ Clients ready\n");
}

// Test state
const testState = {
  testSpreadsheetId: null,
  testReceiptFiles: [],
  startTime: Date.now(),
};

// ============================================================================
// SETUP
// ============================================================================

async function createTestSpreadsheet() {
  console.log("📄 Creating test spreadsheet from template...");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const testName = `Receipts_E2E_Test_${timestamp}`;

  const res = await drive.files.copy({
    fileId: CONFIG.templateSheetId,
    requestBody: {
      name: testName,
      parents: [CONFIG.testFolderId],
    },
  });

  testState.testSpreadsheetId = res.data.id;
  console.log(`✅ Created: ${testName} (${testState.testSpreadsheetId})\n`);

  return testState.testSpreadsheetId;
}

async function uploadFixtureReceipts() {
  console.log("📤 Uploading fixture receipt files...");

  if (!CONFIG.testReceiptsFolderId) {
    console.log("⚠️  Skipping receipt upload - TEST_RECEIPTS_FOLDER_ID not set\n");
    return;
  }

  const fixturesDir = path.join(__dirname, "../fixtures");
  const receiptFile = "receipt.txt";
  const filePath = path.join(fixturesDir, receiptFile);

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Receipt fixture not found: ${receiptFile}\n`);
    return;
  }

  const fileContent = fs.readFileSync(filePath);
  const res = await drive.files.create({
    requestBody: {
      name: `test_${receiptFile}`,
      parents: [CONFIG.testReceiptsFolderId],
      mimeType: "text/plain",
    },
    media: {
      mimeType: "text/plain",
      body: fileContent,
    },
  });

  testState.testReceiptFiles.push(res.data.id);
  console.log(`✅ Uploaded: ${receiptFile} (${res.data.id})\n`);
}

// ============================================================================
// EXECUTE
// ============================================================================

async function runAppsScriptFunction(functionName, parameters = []) {
  console.log(`🚀 Running Apps Script function: ${functionName}...`);

  const request = {
    scriptId: CONFIG.scriptId,
    requestBody: {
      function: functionName,
      parameters,
      devMode: true,
    },
  };

  try {
    const res = await script.scripts.run(request);

    if (res.data.error) {
      console.error("❌ Apps Script error:", JSON.stringify(res.data.error, null, 2));
      throw new Error(`Apps Script execution failed: ${res.data.error.message}`);
    }

    console.log(`✅ ${functionName} completed successfully\n`);
    return res.data.response?.result;
  } catch (err) {
    console.error("❌ Failed to execute:", err.message);
    throw err;
  }
}

async function runReceiptImport() {
  console.log("🧾 Running receipt import workflow...");

  if (!CONFIG.testReceiptsFolderId) {
    console.log("⚠️  Skipping receipt import - TEST_RECEIPTS_FOLDER_ID not set\n");
    return null;
  }

  await runAppsScriptFunction("runReceiptImportE2E", [
    testState.testSpreadsheetId,
    CONFIG.testReceiptsFolderId,
  ]);
}

async function runItemApproval() {
  console.log("📝 Running item approval workflow...");
  return await runAppsScriptFunction("approveItemStagingEntries", [testState.testSpreadsheetId]);
}

async function runUnknownItemsApproval() {
  console.log("📋 Running unknown items approval...");
  return await runAppsScriptFunction("approveUnknownItems", [testState.testSpreadsheetId]);
}

// ============================================================================
// VALIDATE
// ============================================================================

async function validateReceiptImport() {
  console.log("🔍 Validating receipt import results...");

  if (!CONFIG.testReceiptsFolderId) {
    console.log("⚠️  Skipping receipt import validation - TEST_RECEIPTS_FOLDER_ID not set\n");
    return [];
  }

  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];

  const filesRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "receipt_files!A1:Z1000",
  });

  const filesRows = filesRes.data.values || [];
  if (filesRows.length < 2) {
    errors.push("No processed receipts found in receipt_files");
  } else {
    console.log(`  ✅ Found ${filesRows.length - 1} processed receipt(s)`);
  }

  const readyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "transactions_ready!A1:Z1000",
  });

  const readyRows = readyRes.data.values || [];
  const receiptItems = readyRows.slice(1).filter((row) => row[8] === "receipt");

  if (receiptItems.length === 0) {
    console.log("  ⚠️  No receipt items found in transactions_ready (items may be in staging)");
  } else {
    console.log(`  ✅ Found ${receiptItems.length} receipt item(s) in transactions_ready`);
  }

  const stagingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "receipt_staging!A1:Z1000",
  });
  const stagingRows = stagingRes.data.values || [];

  const unknownRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "unknown_items!A1:Z1000",
  });
  const unknownRows = unknownRes.data.values || [];

  console.log(`  ℹ️  Receipt staging: ${stagingRows.length - 1} entries`);
  console.log(`  ℹ️  Unknown items: ${unknownRows.length - 1} entries`);

  console.log("");
  return errors;
}

async function validateItemApproval() {
  console.log("🔍 Validating item approval results...");

  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];

  const readyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "transactions_ready!A1:Z1000",
  });

  const readyRows = readyRes.data.values || [];
  const readyTxIds = readyRows.slice(1).map((row) => row[0]);

  if (!readyTxIds.includes("rcpt-test-001")) {
    errors.push("Test receipt item rcpt-test-001 not found in transactions_ready");
  }
  if (!readyTxIds.includes("rcpt-test-002")) {
    errors.push("Test receipt item rcpt-test-002 not found in transactions_ready");
  }

  if (readyTxIds.includes("rcpt-test-001") && readyTxIds.includes("rcpt-test-002")) {
    console.log("  ✅ Both receipt items successfully moved to transactions_ready");
  }

  const stagingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "receipt_staging!A1:Z1000",
  });

  const stagingRows = stagingRes.data.values || [];
  if (stagingRows.length > 1) {
    errors.push(
      `receipt_staging should be empty after approval, but has ${stagingRows.length - 1} entries`,
    );
  } else {
    console.log("  ✅ receipt_staging cleared successfully");
  }

  console.log("");
  return errors;
}

async function validateUnknownItemsApproval() {
  console.log("🔍 Validating unknown items approval results...");

  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];

  const rulesRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "item_rules!A1:Z1000",
  });

  const rulesRows = rulesRes.data.values || [];
  const rulePatterns = rulesRows.slice(1).map((row) => row[0]);

  if (!rulePatterns.includes("CAFE LATTE")) {
    errors.push("Item rule for CAFE LATTE not created");
  }
  if (!rulePatterns.includes("PRINTER PAPER")) {
    errors.push("Item rule for PRINTER PAPER not created");
  }

  if (rulePatterns.includes("CAFE LATTE") && rulePatterns.includes("PRINTER PAPER")) {
    console.log("  ✅ Both item rules created successfully");

    const cafeLatteRule = rulesRows.find((row) => row[0] === "CAFE LATTE");
    if (cafeLatteRule) {
      if (cafeLatteRule[1] !== "Food" || cafeLatteRule[2] !== "Restaurants") {
        errors.push("CAFE LATTE rule has incorrect category");
      }
      if (cafeLatteRule[3] !== "auto") {
        errors.push("CAFE LATTE rule has incorrect mode");
      }
    }
  }

  const unknownRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "unknown_items!A1:Z1000",
  });

  const unknownRows = unknownRes.data.values || [];
  if (unknownRows.length > 1) {
    errors.push(
      `unknown_items should be empty after approval, but has ${unknownRows.length - 1} entries`,
    );
  } else {
    console.log("  ✅ unknown_items cleared successfully");
  }

  console.log("");
  return errors;
}

async function validateResults() {
  console.log("🔍 Validating overall results...");

  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];

  const readyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "transactions_ready!A1:Z1000",
  });

  const readyRows = readyRes.data.values || [];
  if (readyRows.length < 2) {
    errors.push("No transactions found in transactions_ready");
  } else {
    console.log(`  ✅ Found ${readyRows.length - 1} transactions in ready sheet`);
  }

  if (readyRows.length > 1) {
    const headers = readyRows[0];
    const expectedHeaders = ["tx_id", "date", "month", "merchant", "amount", "group", "category"];

    const missingHeaders = expectedHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      errors.push(`Missing headers in transactions_ready: ${missingHeaders.join(", ")}`);
    }

    const firstRow = readyRows[1];
    if (!firstRow[0] || !firstRow[1] || !firstRow[3]) {
      errors.push("First transaction missing required fields (tx_id, date, or merchant)");
    } else {
      console.log("  ✅ Data structure valid");
    }
  }

  console.log("");

  if (errors.length > 0) {
    console.error("❌ Validation errors:");
    errors.forEach((err) => console.error(`  - ${err}`));
    return false;
  }

  console.log("✅ All validations passed\n");
  return true;
}

// ============================================================================
// CLEANUP
// ============================================================================

async function cleanup() {
  console.log("🧹 Cleaning up test files...");

  const filesToDelete = [testState.testSpreadsheetId, ...testState.testReceiptFiles].filter(
    Boolean,
  );

  for (const fileId of filesToDelete) {
    try {
      await drive.files.delete({ fileId });
      console.log(`  ✅ Deleted: ${fileId}`);
    } catch (err) {
      console.warn(`  ⚠️  Failed to delete ${fileId}: ${err.message}`);
    }
  }

  console.log("");
}

// ============================================================================
// MAIN
// ============================================================================

async function runReceiptsE2ETests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🧾 Receipts E2E Test Suite");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    await setupClients();
    await createTestSpreadsheet();
    await seedTestData(sheets, testState.testSpreadsheetId);

    await uploadFixtureReceipts();
    await seedItemRules(sheets, testState.testSpreadsheetId);
    await runReceiptImport();
    const receiptImportErrors = await validateReceiptImport();

    await seedReceiptStagingEntries(sheets, testState.testSpreadsheetId);
    await runItemApproval();
    const itemApprovalErrors = await validateItemApproval();

    await seedUnknownItems(sheets, testState.testSpreadsheetId);
    await runUnknownItemsApproval();
    const unknownItemsErrors = await validateUnknownItemsApproval();

    const isValid = await validateResults();

    const allErrors = [...receiptImportErrors, ...itemApprovalErrors, ...unknownItemsErrors];
    if (!isValid) {
      allErrors.push("Overall validation failed");
    }

    if (process.env.SKIP_CLEANUP !== "true") {
      await cleanup();
    } else {
      console.log("⚠️  Skipping cleanup (SKIP_CLEANUP=true)");
      console.log(
        `   Test spreadsheet: https://docs.google.com/spreadsheets/d/${testState.testSpreadsheetId}/edit\n`,
      );
    }

    const duration = ((Date.now() - testState.startTime) / 1000).toFixed(2);
    console.log("═══════════════════════════════════════════════════════════");
    if (allErrors.length === 0) {
      console.log(`✅ Receipts E2E tests passed! (${duration}s)`);
      console.log("   - Receipt import ✅");
      console.log("   - Item approval ✅");
      console.log("   - Unknown items approval ✅");
      console.log("═══════════════════════════════════════════════════════════\n");
      process.exit(0);
    } else {
      console.log(`❌ Receipts E2E tests failed with ${allErrors.length} error(s) (${duration}s)`);
      allErrors.forEach((err) => console.error(`   - ${err}`));
      console.log("═══════════════════════════════════════════════════════════\n");
      process.exit(1);
    }
  } catch (err) {
    console.error("\n❌ Receipts E2E test suite failed with error:");
    console.error(err);

    if (process.env.SKIP_CLEANUP !== "true") {
      try {
        await cleanup();
      } catch (cleanupErr) {
        console.warn("Warning: Cleanup failed:", cleanupErr.message);
      }
    }

    process.exit(1);
  }
}

if (require.main === module) {
  validateConfig();
  runReceiptsE2ETests();
}

module.exports = { runReceiptsE2ETests };

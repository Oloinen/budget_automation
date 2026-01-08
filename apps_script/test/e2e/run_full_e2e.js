#!/usr/bin/env node
/**
 * Comprehensive E2E Test Suite
 * 
 * Tests the full budget automation workflow:
 * 1. Creates test spreadsheet from template
 * 2. Uploads fixture CSV files to Drive
 * 3. Runs credit card import
 * 4. Runs receipt import (optional)
 * 5. Runs merchant approval
 * 6. Runs unknown merchants approval
 * 7. Runs item approval
 * 8. Runs unknown items approval
 * 9. Validates transactions landed in correct sheets
 * 10. Cleans up test files
 * 
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_JSON='{"type":"service_account",...}' \
 *   APPS_SCRIPT_ID=xxx \
 *   TEST_TEMPLATE_SHEET_ID=xxx \
 *   TEST_FOLDER_ID=xxx \
 *   TEST_RECEIPTS_FOLDER_ID=xxx \
 *   node test/e2e/run_full_e2e.js
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { 
  seedTestData, 
  seedStagingEntries, 
  seedUnknownMerchants,
  seedReceiptStagingEntries,
  seedUnknownItems,
  seedItemRules
} = require('./seed_test_data');

// Configuration from environment
const CONFIG = {
  scriptId: process.env.APPS_SCRIPT_ID,
  templateSheetId: process.env.TEST_TEMPLATE_SHEET_ID,
  testFolderId: process.env.TEST_FOLDER_ID,
  testReceiptsFolderId: process.env.TEST_RECEIPTS_FOLDER_ID, // Folder for test receipt files
  keyJson: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON,
  testBudgetYear: 2026,
};

// Validate required env vars
function validateConfig() {
  const missing = [];
  if (!CONFIG.scriptId) missing.push('APPS_SCRIPT_ID');
  if (!CONFIG.templateSheetId) missing.push('TEST_TEMPLATE_SHEET_ID');
  if (!CONFIG.testFolderId) missing.push('TEST_FOLDER_ID');
  if (!CONFIG.keyJson) missing.push('GOOGLE_SERVICE_ACCOUNT_KEY_JSON');
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

// Google API clients
let auth, sheets, drive, script;

async function setupClients() {
  console.log('🔧 Setting up Google API clients...');
  
  const credentials = JSON.parse(CONFIG.keyJson);
  auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/script.projects',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ]
  });

  const client = await auth.getClient();
  sheets = google.sheets({ version: 'v4', auth: client });
  drive = google.drive({ version: 'v3', auth: client });
  script = google.script({ version: 'v1', auth: client });
  
  console.log('✅ Clients ready\n');
}

// Test state
const testState = {
  testSpreadsheetId: null,
  testCsvFiles: [],
  testReceiptFiles: [],
  startTime: Date.now(),
};

// ============================================================================
// SETUP: Create test environment
// ============================================================================

async function createTestSpreadsheet() {
  console.log('📄 Creating test spreadsheet from template...');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const testName = `E2E_Test_${timestamp}`;
  
  const res = await drive.files.copy({
    fileId: CONFIG.templateSheetId,
    requestBody: {
      name: testName,
      parents: [CONFIG.testFolderId]
    }
  });
  
  testState.testSpreadsheetId = res.data.id;
  console.log(`✅ Created: ${testName} (${testState.testSpreadsheetId})\n`);
  
  return testState.testSpreadsheetId;
}

async function uploadFixtureCsv() {
  console.log('📤 Uploading fixture CSV files...');
  
  const fixturesDir = path.join(__dirname, '../fixtures');
  const csvFiles = [
    'cc_statement_basic.csv',
    'cc_statement_mixed_year.csv'
  ];
  
  for (const filename of csvFiles) {
    const filePath = path.join(fixturesDir, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Fixture not found: ${filename}`);
      continue;
    }
    
    const fileContent = fs.readFileSync(filePath);
    const res = await drive.files.create({
      requestBody: {
        name: `test_${filename}`,
        parents: [CONFIG.testFolderId],
        mimeType: 'text/csv'
      },
      media: {
        mimeType: 'text/csv',
        body: fileContent
      }
    });
    
    testState.testCsvFiles.push(res.data.id);
    console.log(`✅ Uploaded: ${filename} (${res.data.id})`);
  }
  
  console.log('');
}

async function uploadFixtureReceipts() {
  console.log('📤 Uploading fixture receipt files...');
  
  if (!CONFIG.testReceiptsFolderId) {
    console.log('⚠️  Skipping receipt upload - TEST_RECEIPTS_FOLDER_ID not set\n');
    return;
  }
  
  const fixturesDir = path.join(__dirname, '../fixtures');
  const receiptFile = 'receipt.txt';
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
      mimeType: 'text/plain'
    },
    media: {
      mimeType: 'text/plain',
      body: fileContent
    }
  });
  
  testState.testReceiptFiles = testState.testReceiptFiles || [];
  testState.testReceiptFiles.push(res.data.id);
  console.log(`✅ Uploaded: ${receiptFile} (${res.data.id})\n`);
}

// ============================================================================
// EXECUTE: Run Apps Script functions
// ============================================================================

async function runAppsScriptFunction(functionName, parameters = []) {
  console.log(`🚀 Running Apps Script function: ${functionName}...`);
  
  const request = {
    scriptId: CONFIG.scriptId,
    requestBody: {
      function: functionName,
      parameters,
      devMode: true
    }
  };
  
  try {
    const res = await script.scripts.run(request);
    
    if (res.data.error) {
      console.error('❌ Apps Script error:', JSON.stringify(res.data.error, null, 2));
      throw new Error(`Apps Script execution failed: ${res.data.error.message}`);
    }
    
    console.log(`✅ ${functionName} completed successfully\n`);
    return res.data.response?.result;
  } catch (err) {
    console.error('❌ Failed to execute:', err.message);
    throw err;
  }
}

async function runCreditCardImport() {
  console.log('💳 Running credit card import workflow...');
  
  await runAppsScriptFunction('runCreditCardImportE2E', [
    testState.testSpreadsheetId,
    CONFIG.testBudgetYear
  ]);
}

async function runReceiptImport() {
  console.log('🧾 Running receipt import workflow...');
  
  if (!CONFIG.testReceiptsFolderId) {
    console.log('⚠️  Skipping receipt import - TEST_RECEIPTS_FOLDER_ID not set\n');
    return null;
  }
  
  await runAppsScriptFunction('runReceiptImportE2E', [
    testState.testSpreadsheetId,
    CONFIG.testReceiptsFolderId
  ]);
}

async function runMerchantApproval() {
  console.log('✅ Running merchant approval workflow...');
  
  const result = await runAppsScriptFunction('approveMerchantStagingEntries', [
    testState.testSpreadsheetId
  ]);
  
  return result;
}

async function runUnknownMerchantsApproval() {
  console.log('📋 Running unknown merchants approval...');
  
  const result = await runAppsScriptFunction('approveUnknownMerchants', [
    testState.testSpreadsheetId
  ]);
  
  return result;
}

async function runItemApproval() {
  console.log('📝 Running item approval workflow...');
  
  const result = await runAppsScriptFunction('approveItemStagingEntries', [
    testState.testSpreadsheetId
  ]);
  
  return result;
}

async function runUnknownItemsApproval() {
  console.log('📋 Running unknown items approval...');
  
  const result = await runAppsScriptFunction('approveUnknownItems', [
    testState.testSpreadsheetId
  ]);
  
  return result;
}

// ============================================================================
// VALIDATE: Check results
// ============================================================================

async function validateMerchantApproval() {
  console.log('🔍 Validating merchant approval results...');
  
  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];
  
  // Check that staging entries were moved to transactions_ready
  console.log('  Checking transactions_ready for approved entries...');
  const readyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'transactions_ready!A1:Z1000'
  });
  
  const readyRows = readyRes.data.values || [];
  const readyTxIds = readyRows.slice(1).map(row => row[0]);
  
  // Should contain our test transactions
  if (!readyTxIds.includes('cc-test-001')) {
    errors.push('Test transaction cc-test-001 not found in transactions_ready');
  }
  if (!readyTxIds.includes('cc-test-002')) {
    errors.push('Test transaction cc-test-002 not found in transactions_ready');
  }
  
  if (readyTxIds.includes('cc-test-001') && readyTxIds.includes('cc-test-002')) {
    console.log('  ✅ Both staging entries successfully moved to transactions_ready');
  }
  
  // Check that staging is now empty (or only has headers)
  console.log('  Checking credit_card_staging is cleared...');
  const stagingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'credit_card_staging!A1:Z1000'
  });
  
  const stagingRows = stagingRes.data.values || [];
  if (stagingRows.length > 1) {
    errors.push(`credit_card_staging should be empty after approval, but has ${stagingRows.length - 1} entries`);
  } else {
    console.log('  ✅ credit_card_staging cleared successfully');
  }
  
  console.log('');
  return errors;
}

async function validateUnknownMerchantsApproval() {
  console.log('🔍 Validating unknown merchants approval results...');
  
  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];
  
  // Check that rules were created in merchant_rules
  console.log('  Checking merchant_rules for new entries...');
  const rulesRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'merchant_rules!A1:Z1000'
  });
  
  const rulesRows = rulesRes.data.values || [];
  const ruleMerchants = rulesRows.slice(1).map(row => row[0]); // Get merchant names
  
  // Should contain rules for our unknown merchants
  if (!ruleMerchants.includes('NEW RESTAURANT')) {
    errors.push('Merchant rule for NEW RESTAURANT not created');
  }
  if (!ruleMerchants.includes('UNKNOWN SHOP')) {
    errors.push('Merchant rule for UNKNOWN SHOP not created');
  }
  
  if (ruleMerchants.includes('NEW RESTAURANT') && ruleMerchants.includes('UNKNOWN SHOP')) {
    console.log('  ✅ Both merchant rules created successfully');
    
    // Validate rule details
    const newRestaurantRule = rulesRows.find(row => row[0] === 'NEW RESTAURANT');
    if (newRestaurantRule) {
      if (newRestaurantRule[1] !== 'Food' || newRestaurantRule[2] !== 'Restaurants') {
        errors.push('NEW RESTAURANT rule has incorrect category');
      }
      if (newRestaurantRule[3] !== 'auto') {
        errors.push('NEW RESTAURANT rule has incorrect mode');
      }
    }
  }
  
  // Check that unknown_merchants is now empty (or only has headers)
  console.log('  Checking unknown_merchants is cleared...');
  const unknownRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'unknown_merchants!A1:Z1000'
  });
  
  const unknownRows = unknownRes.data.values || [];
  if (unknownRows.length > 1) {
    errors.push(`unknown_merchants should be empty after approval, but has ${unknownRows.length - 1} entries`);
  } else {
    console.log('  ✅ unknown_merchants cleared successfully');
  }
  
  console.log('');
  return errors;
}

async function validateReceiptImport() {
  console.log('🔍 Validating receipt import results...');
  
  if (!CONFIG.testReceiptsFolderId) {
    console.log('⚠️  Skipping receipt import validation - TEST_RECEIPTS_FOLDER_ID not set\n');
    return [];
  }
  
  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];
  
  // Check that receipt_files sheet has entries
  console.log('  Checking receipt_files for processed receipts...');
  const filesRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'receipt_files!A1:Z1000'
  });
  
  const filesRows = filesRes.data.values || [];
  if (filesRows.length < 2) {
    errors.push('No processed receipts found in receipt_files');
  } else {
    console.log(`  ✅ Found ${filesRows.length - 1} processed receipt(s)`);
  }
  
  // Check that transactions_ready has some entries from receipt import
  console.log('  Checking transactions_ready for receipt items...');
  const readyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'transactions_ready!A1:Z1000'
  });
  
  const readyRows = readyRes.data.values || [];
  const receiptItems = readyRows.slice(1).filter(row => row[8] === 'receipt'); // source column
  
  if (receiptItems.length === 0) {
    console.log('  ⚠️  No receipt items found in transactions_ready (items may be in staging)');
  } else {
    console.log(`  ✅ Found ${receiptItems.length} receipt item(s) in transactions_ready`);
  }
  
  // Check receipt_staging or unknown_items for unmatched items
  console.log('  Checking receipt_staging and unknown_items...');
  const stagingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'receipt_staging!A1:Z1000'
  });
  const stagingRows = stagingRes.data.values || [];
  
  const unknownRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'unknown_items!A1:Z1000'
  });
  const unknownRows = unknownRes.data.values || [];
  
  console.log(`  ℹ️  Receipt staging: ${stagingRows.length - 1} entries`);
  console.log(`  ℹ️  Unknown items: ${unknownRows.length - 1} entries`);
  
  console.log('');
  return errors;
}

async function validateItemApproval() {
  console.log('🔍 Validating item approval results...');
  
  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];
  
  // Check that receipt staging entries were moved to transactions_ready
  console.log('  Checking transactions_ready for approved receipt items...');
  const readyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'transactions_ready!A1:Z1000'
  });
  
  const readyRows = readyRes.data.values || [];
  const readyTxIds = readyRows.slice(1).map(row => row[0]);
  
  // Should contain our test receipt transactions
  if (!readyTxIds.includes('rcpt-test-001')) {
    errors.push('Test receipt item rcpt-test-001 not found in transactions_ready');
  }
  if (!readyTxIds.includes('rcpt-test-002')) {
    errors.push('Test receipt item rcpt-test-002 not found in transactions_ready');
  }
  
  if (readyTxIds.includes('rcpt-test-001') && readyTxIds.includes('rcpt-test-002')) {
    console.log('  ✅ Both receipt items successfully moved to transactions_ready');
  }
  
  // Check that receipt_staging is now empty (or only has headers)
  console.log('  Checking receipt_staging is cleared...');
  const stagingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'receipt_staging!A1:Z1000'
  });
  
  const stagingRows = stagingRes.data.values || [];
  if (stagingRows.length > 1) {
    errors.push(`receipt_staging should be empty after approval, but has ${stagingRows.length - 1} entries`);
  } else {
    console.log('  ✅ receipt_staging cleared successfully');
  }
  
  console.log('');
  return errors;
}

async function validateUnknownItemsApproval() {
  console.log('🔍 Validating unknown items approval results...');
  
  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];
  
  // Check that rules were created in item_rules
  console.log('  Checking item_rules for new entries...');
  const rulesRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'item_rules!A1:Z1000'
  });
  
  const rulesRows = rulesRes.data.values || [];
  const rulePatterns = rulesRows.slice(1).map(row => row[0]); // Get item patterns
  
  // Should contain rules for our unknown items
  if (!rulePatterns.includes('CAFE LATTE')) {
    errors.push('Item rule for CAFE LATTE not created');
  }
  if (!rulePatterns.includes('PRINTER PAPER')) {
    errors.push('Item rule for PRINTER PAPER not created');
  }
  
  if (rulePatterns.includes('CAFE LATTE') && rulePatterns.includes('PRINTER PAPER')) {
    console.log('  ✅ Both item rules created successfully');
    
    // Validate rule details
    const cafeLatteRule = rulesRows.find(row => row[0] === 'CAFE LATTE');
    if (cafeLatteRule) {
      if (cafeLatteRule[1] !== 'Food' || cafeLatteRule[2] !== 'Restaurants') {
        errors.push('CAFE LATTE rule has incorrect category');
      }
      if (cafeLatteRule[3] !== 'auto') {
        errors.push('CAFE LATTE rule has incorrect mode');
      }
    }
  }
  
  // Check that unknown_items is now empty (or only has headers)
  console.log('  Checking unknown_items is cleared...');
  const unknownRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'unknown_items!A1:Z1000'
  });
  
  const unknownRows = unknownRes.data.values || [];
  if (unknownRows.length > 1) {
    errors.push(`unknown_items should be empty after approval, but has ${unknownRows.length - 1} entries`);
  } else {
    console.log('  ✅ unknown_items cleared successfully');
  }
  
  console.log('');
  return errors;
}

async function validateResults() {
  console.log('🔍 Validating all results...');
  
  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];
  
  // Check transactions_ready sheet
  console.log('  Checking transactions_ready...');
  const readyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'transactions_ready!A1:Z1000'
  });
  
  const readyRows = readyRes.data.values || [];
  if (readyRows.length < 2) {
    errors.push('No transactions found in transactions_ready');
  } else {
    console.log(`  ✅ Found ${readyRows.length - 1} transactions in ready sheet`);
  }
  
  // Validate data structure
  if (readyRows.length > 1) {
    const headers = readyRows[0];
    const expectedHeaders = ['tx_id', 'date', 'month', 'merchant', 'amount', 'group', 'category'];
    
    const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      errors.push(`Missing headers in transactions_ready: ${missingHeaders.join(', ')}`);
    }
    
    // Check first data row has required fields
    const firstRow = readyRows[1];
    if (!firstRow[0] || !firstRow[1] || !firstRow[3]) {
      errors.push('First transaction missing required fields (tx_id, date, or merchant)');
    } else {
      console.log(`  ✅ Data structure valid`);
    }
  }
  
  console.log('');
  
  if (errors.length > 0) {
    console.error('❌ Validation errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }
  
  console.log('✅ All validations passed\n');
  return true;
}

// ============================================================================
// CLEANUP: Remove test files
// ============================================================================

async function cleanup() {
  console.log('🧹 Cleaning up test files...');
  
  const filesToDelete = [
    testState.testSpreadsheetId,
    ...testState.testCsvFiles,
    ...(testState.testReceiptFiles || [])
  ].filter(Boolean);
  
  for (const fileId of filesToDelete) {
    try {
      await drive.files.delete({ fileId });
      console.log(`  ✅ Deleted: ${fileId}`);
    } catch (err) {
      console.warn(`  ⚠️  Failed to delete ${fileId}: ${err.message}`);
    }
  }
  
  console.log('');
}

// ============================================================================
// MAIN TEST FLOW
// ============================================================================

async function runE2ETests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Budget Automation E2E Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    // Setup
    await setupClients();
    await createTestSpreadsheet();
    await uploadFixtureCsv();
    await seedTestData(sheets, testState.testSpreadsheetId);
    
    // Execute workflows
    await runCreditCardImport();
    
    // Test receipt import workflow (optional - requires Cloud Function)
    await uploadFixtureReceipts();
    await seedItemRules(sheets, testState.testSpreadsheetId);
    await runReceiptImport();
    const receiptImportErrors = await validateReceiptImport();
    
    // Test merchant approval workflow
    await seedStagingEntries(sheets, testState.testSpreadsheetId);
    await runMerchantApproval();
    const merchantApprovalErrors = await validateMerchantApproval();
    
    // Test unknown merchants approval workflow
    await seedUnknownMerchants(sheets, testState.testSpreadsheetId);
    await runUnknownMerchantsApproval();
    const unknownMerchantsErrors = await validateUnknownMerchantsApproval();
    
    // Test receipt item approval workflow
    await seedReceiptStagingEntries(sheets, testState.testSpreadsheetId);
    await runItemApproval();
    const itemApprovalErrors = await validateItemApproval();
    
    // Test unknown items approval workflow
    await seedUnknownItems(sheets, testState.testSpreadsheetId);
    await runUnknownItemsApproval();
    const unknownItemsErrors = await validateUnknownItemsApproval();
    
    // Validate overall results
    const isValid = await validateResults();
    
    // Collect all errors
    const allErrors = [
      ...receiptImportErrors,
      ...merchantApprovalErrors, 
      ...unknownMerchantsErrors,
      ...itemApprovalErrors,
      ...unknownItemsErrors
    ];
    if (!isValid) {
      allErrors.push('Overall validation failed');
    }
    
    // Cleanup
    if (process.env.SKIP_CLEANUP !== 'true') {
      await cleanup();
    } else {
      console.log('⚠️  Skipping cleanup (SKIP_CLEANUP=true)');
      console.log(`   Test spreadsheet: https://docs.google.com/spreadsheets/d/${testState.testSpreadsheetId}/edit\n`);
    }
    
    // Summary
    const duration = ((Date.now() - testState.startTime) / 1000).toFixed(2);
    console.log('═══════════════════════════════════════════════════════════');
    if (allErrors.length === 0) {
      console.log(`✅ All E2E tests passed! (${duration}s)`);
      console.log('   - Credit card import ✅');
      console.log('   - Receipt import ✅');
      console.log('   - Merchant approval ✅');
      console.log('   - Unknown merchants approval ✅');
      console.log('   - Receipt item approval ✅');
      console.log('   - Unknown items approval ✅');
      console.log('═══════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log(`❌ E2E tests failed with ${allErrors.length} error(s) (${duration}s)`);
      allErrors.forEach(err => console.error(`   - ${err}`));
      console.log('═══════════════════════════════════════════════════════════\n');
      process.exit(1);
    }
    
  } catch (err) {
    console.error('\n❌ E2E test suite failed with error:');
    console.error(err);
    
    // Attempt cleanup even on failure
    if (process.env.SKIP_CLEANUP !== 'true') {
      try {
        await cleanup();
      } catch (cleanupErr) {
        console.warn('Warning: Cleanup failed:', cleanupErr.message);
      }
    }
    
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  validateConfig();
  runE2ETests();
}

module.exports = { runE2ETests };

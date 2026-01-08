#!/usr/bin/env node
/**
 * Credit Card E2E Test Suite
 * 
 * Tests credit card workflows:
 * 1. Credit card import
 * 2. Merchant approval
 * 3. Unknown merchants approval
 * 
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_JSON='{"type":"service_account",...}' \
 *   APPS_SCRIPT_ID=xxx \
 *   TEST_TEMPLATE_SHEET_ID=xxx \
 *   TEST_FOLDER_ID=xxx \
 *   node test/e2e/run_credit_card_e2e.js
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { seedTestData, seedStagingEntries, seedUnknownMerchants } = require('./seed_test_data');

// Configuration from environment
const CONFIG = {
  scriptId: process.env.APPS_SCRIPT_ID,
  templateSheetId: process.env.TEST_TEMPLATE_SHEET_ID,
  testFolderId: process.env.TEST_FOLDER_ID,
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
  startTime: Date.now(),
};

// ============================================================================
// SETUP
// ============================================================================

async function createTestSpreadsheet() {
  console.log('📄 Creating test spreadsheet from template...');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const testName = `CC_E2E_Test_${timestamp}`;
  
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
  const csvFiles = ['cc_statement_basic.csv', 'cc_statement_mixed_year.csv'];
  
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

async function runMerchantApproval() {
  console.log('✅ Running merchant approval workflow...');
  return await runAppsScriptFunction('approveMerchantStagingEntries', [
    testState.testSpreadsheetId
  ]);
}

async function runUnknownMerchantsApproval() {
  console.log('📋 Running unknown merchants approval...');
  return await runAppsScriptFunction('approveUnknownMerchants', [
    testState.testSpreadsheetId
  ]);
}

// ============================================================================
// VALIDATE
// ============================================================================

async function validateMerchantApproval() {
  console.log('🔍 Validating merchant approval results...');
  
  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];
  
  const readyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'transactions_ready!A1:Z1000'
  });
  
  const readyRows = readyRes.data.values || [];
  const readyTxIds = readyRows.slice(1).map(row => row[0]);
  
  if (!readyTxIds.includes('cc-test-001')) {
    errors.push('Test transaction cc-test-001 not found in transactions_ready');
  }
  if (!readyTxIds.includes('cc-test-002')) {
    errors.push('Test transaction cc-test-002 not found in transactions_ready');
  }
  
  if (readyTxIds.includes('cc-test-001') && readyTxIds.includes('cc-test-002')) {
    console.log('  ✅ Both staging entries successfully moved to transactions_ready');
  }
  
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
  
  const rulesRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'merchant_rules!A1:Z1000'
  });
  
  const rulesRows = rulesRes.data.values || [];
  const ruleMerchants = rulesRows.slice(1).map(row => row[0]);
  
  if (!ruleMerchants.includes('NEW RESTAURANT')) {
    errors.push('Merchant rule for NEW RESTAURANT not created');
  }
  if (!ruleMerchants.includes('UNKNOWN SHOP')) {
    errors.push('Merchant rule for UNKNOWN SHOP not created');
  }
  
  if (ruleMerchants.includes('NEW RESTAURANT') && ruleMerchants.includes('UNKNOWN SHOP')) {
    console.log('  ✅ Both merchant rules created successfully');
    
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

async function validateResults() {
  console.log('🔍 Validating overall results...');
  
  const spreadsheetId = testState.testSpreadsheetId;
  let errors = [];
  
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
  
  if (readyRows.length > 1) {
    const headers = readyRows[0];
    const expectedHeaders = ['tx_id', 'date', 'month', 'merchant', 'amount', 'group', 'category'];
    
    const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      errors.push(`Missing headers in transactions_ready: ${missingHeaders.join(', ')}`);
    }
    
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
// CLEANUP
// ============================================================================

async function cleanup() {
  console.log('🧹 Cleaning up test files...');
  
  const filesToDelete = [
    testState.testSpreadsheetId,
    ...testState.testCsvFiles
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
// MAIN
// ============================================================================

async function runCreditCardE2ETests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💳 Credit Card E2E Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    await setupClients();
    await createTestSpreadsheet();
    await uploadFixtureCsv();
    await seedTestData(sheets, testState.testSpreadsheetId);
    
    await runCreditCardImport();
    
    await seedStagingEntries(sheets, testState.testSpreadsheetId);
    await runMerchantApproval();
    const merchantApprovalErrors = await validateMerchantApproval();
    
    await seedUnknownMerchants(sheets, testState.testSpreadsheetId);
    await runUnknownMerchantsApproval();
    const unknownMerchantsErrors = await validateUnknownMerchantsApproval();
    
    const isValid = await validateResults();
    
    const allErrors = [...merchantApprovalErrors, ...unknownMerchantsErrors];
    if (!isValid) {
      allErrors.push('Overall validation failed');
    }
    
    if (process.env.SKIP_CLEANUP !== 'true') {
      await cleanup();
    } else {
      console.log('⚠️  Skipping cleanup (SKIP_CLEANUP=true)');
      console.log(`   Test spreadsheet: https://docs.google.com/spreadsheets/d/${testState.testSpreadsheetId}/edit\n`);
    }
    
    const duration = ((Date.now() - testState.startTime) / 1000).toFixed(2);
    console.log('═══════════════════════════════════════════════════════════');
    if (allErrors.length === 0) {
      console.log(`✅ Credit card E2E tests passed! (${duration}s)`);
      console.log('   - Credit card import ✅');
      console.log('   - Merchant approval ✅');
      console.log('   - Unknown merchants approval ✅');
      console.log('═══════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log(`❌ Credit card E2E tests failed with ${allErrors.length} error(s) (${duration}s)`);
      allErrors.forEach(err => console.error(`   - ${err}`));
      console.log('═══════════════════════════════════════════════════════════\n');
      process.exit(1);
    }
    
  } catch (err) {
    console.error('\n❌ Credit card E2E test suite failed with error:');
    console.error(err);
    
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

if (require.main === module) {
  validateConfig();
  runCreditCardE2ETests();
}

module.exports = { runCreditCardE2ETests };

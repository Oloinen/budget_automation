// Shared E2E configuration validator
function validateE2EEnv(requiredEnvVars = []) {
  const { loadConfig } = require('./load_config');
  const cfg = loadConfig();

  // Check for production Apps Script IDs first (critical safety check)
  const PRODUCTION_SCRIPT_IDS = cfg.productionScriptIds || [];
  const scriptId = cfg.scriptId;
  if (scriptId && PRODUCTION_SCRIPT_IDS.includes(scriptId)) {
    console.error('');
    console.error('❌ ═══════════════════════════════════════════════════════════════');
    console.error('❌ FATAL: Attempting to run E2E against PRODUCTION Apps Script!');
    console.error('❌ ═══════════════════════════════════════════════════════════════');
    console.error('');
    console.error('   Current APPS_SCRIPT_ID:', scriptId);
    console.error('   Production IDs:', PRODUCTION_SCRIPT_IDS.join(', '));
    console.error('');
    console.error('   ACTION REQUIRED:');
    console.error('   1. Set APPS_SCRIPT_ID to a test/staging deployment');
    console.error('   2. Or remove this ID from PRODUCTION_SCRIPT_IDS');
    console.error('');
    console.error('❌ ═══════════════════════════════════════════════════════════════');
    console.error('');
    process.exit(1);
  }

  // Check for production spreadsheet access without explicit flag
  if (cfg.productionBudgetDataSheetId && !cfg.allowProductionCopy) {
    console.error('');
    console.error('⚠️  WARNING: PRODUCTION_BUDGET_DATA_SHEET_ID is set');
    console.error('   but ALLOW_PRODUCTION_COPY is not enabled.');
    console.error('');
    console.error('   If you need to copy production data for testing,');
    console.error('   set: ALLOW_PRODUCTION_COPY=true');
    console.error('');
  }

  // Validate required environment variables
  const missing = requiredEnvVars.filter((k) => !cfg[k.replace(/^[A-Z_]+$/, (s) => s)]);
  const missingVars = requiredEnvVars.filter((k) => {
    const prop = {
      APPS_SCRIPT_ID: 'scriptId',
      TEST_TEMPLATE_SHEET_ID: 'templateSheetId',
      TEST_FOLDER_ID: 'testFolderId',
      TEST_RECEIPTS_FOLDER_ID: 'testReceiptsFolderId',
      GOOGLE_SERVICE_ACCOUNT_KEY_JSON: 'keyJson',
      TEST_SPREADSHEET_ID: 'testSpreadsheetId',
      PRODUCTION_BUDGET_DATA_SHEET_ID: 'productionBudgetDataSheetId',
    }[k];
    if (!prop) return !process.env[k];
    return !cfg[prop];
  });

  if (missingVars.length > 0) {
    console.error('');
    console.error('❌ Missing required environment variables:');
    missingVars.forEach((v) => console.error(`   - ${v}`));
    console.error('');
    console.error('   See apps_script/test/e2e/.env.template for setup instructions.');
    console.error('');
    process.exit(1);
  }

  // Success message with key config info
  console.log('✅ E2E Configuration validated');
  console.log(`   Apps Script ID: ${scriptId?.substring(0, 20)}...`);
  console.log(`   Test mode: ${cfg.mockGoogleApi ? 'MOCK' : 'LIVE'}`);
  if (cfg.skipCleanup) {
    console.log('   ⚠️  Cleanup disabled (test files will remain)');
  }
  console.log('');
}

module.exports = { validateE2EEnv };

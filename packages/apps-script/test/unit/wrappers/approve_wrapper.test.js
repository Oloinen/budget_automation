const fs = require('fs');
const path = require('path');

test('approveMerchantStagingEntries wrapper returns structured WorkflowError response', () => {
  const srcPath = path.join(__dirname, '..', '..', '..', 'src', 'workflows', 'credit-card', 'merchant_approval.js');
  let src = fs.readFileSync(srcPath, 'utf8');

  // Inject an immediate WorkflowError throw at the start of the internal function
  src = src.replace(
    'function _approveMerchantStagingEntries(testSpreadsheetId) {',
    "function _approveMerchantStagingEntries(testSpreadsheetId) { var errs = require('../../src/errors'); throw new errs.WorkflowError('simulated-approve','SIM_APPROVE',{info:'approve'});",
  );

  // Create a require shim so relative requires inside the evaluated source
  // resolve as if they were located in the source file's directory.
  const requireShim = (p) => {
    try {
      if (p.startsWith('.')) return require(path.join(path.dirname(srcPath), p));
      if (p.startsWith('..')) return require(path.join(path.dirname(srcPath), p));
      return require(p);
    } catch (e) {
      if (p.endsWith('errors') || p.includes('/errors')) {
        return require(path.join(__dirname, '..', '..', '..', 'src', 'core', 'errors'));
      }
      if (p.includes('parsers/data')) {
        return require(path.join(__dirname, '..', '..', '..', 'src', 'core', 'parsers', 'data'));
      }
      if (p.includes('utilities')) {
        return require(path.join(__dirname, '..', '..', '..', 'src', 'core', 'utilities'));
      }
      const alt = path.join(__dirname, '..', '..', '..', 'src', p.replace(/^\.\//, ''));
      return require(alt);
    }
  };

  const fn = new Function(
    'require',
    'SpreadsheetApp',
    'STATUS_NEEDS_REVIEW',
    'STATUS_NEEDS_RULE',
    'STATUS_APPROVED',
    'STATUS_ERROR',
    'TAB_CC_STAGING',
    'TAB_TRANSACTIONS_READY',
    'TAB_CATEGORIES',
    'console',
    'Logger',
    src + "\nreturn { approveMerchantStagingEntries };",
  );

  const funcs = fn(requireShim, {}, 'NEEDS_REVIEW', 'NEEDS_RULE', 'APPROVED', 'ERROR', 'credit-card_staging', 'transactions_ready', 'categories', console, { log: () => {} });

  const res = funcs.approveMerchantStagingEntries();

  expect(res.success).toBe(false);
  expect(res.error).toBe('simulated-approve');
  expect(res.code).toBe('SIM_APPROVE');
  expect(res.details).toEqual({ info: 'approve' });
});

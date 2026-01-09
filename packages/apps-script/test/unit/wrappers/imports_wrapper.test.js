const fs = require('fs');
const path = require('path');

test('runCreditCardImport wrapper returns structured WorkflowError response when quota guard aborts', () => {
  const srcPath = path.join(__dirname, '..', '..', '..', 'src', 'workflows', 'credit-card', 'credit_card_import.js');
  let src = fs.readFileSync(srcPath, 'utf8');

  src = src.replace(
    'function _runCreditCardImport(deps) {',
    "function _runCreditCardImport(deps) { var errs = require('../../src/errors'); throw new errs.WorkflowError('simulated-quota-cc','SIM_QUOTA_CC',{info:'quota'});",
  );

  const requireShim = (p) => {
    try {
      if (p.startsWith('.')) return require(path.join(path.dirname(srcPath), p));
      if (p.startsWith('..')) return require(path.join(path.dirname(srcPath), p));
      return require(p);
    } catch (e) {
      // Fallback: if the module was the project's errors module, resolve explicitly
      if (p.endsWith('errors') || p.includes('/errors')) {
        return require(path.join(__dirname, '..', '..', '..', 'src', 'core', 'errors'));
      }
      // Fallback for runtime-ids
      if (p.endsWith('runtime-ids') || p.includes('/runtime-ids')) {
        return require(path.join(__dirname, '..', '..', '..', 'src', 'core', 'runtime-ids'));
      }
      // Fallback for shared/schema
      if (p.includes('shared/schema')) {
        return require(path.join(__dirname, '..', '..', '..', 'shared', 'schema'));
      }
      // Generic fallback: resolve from project src root
      const alt = path.join(__dirname, '..', '..', '..', 'src', p.replace(/^\.\//, ''));
      return require(alt);
    }
  };

  const fn = new Function('require', 'globalThis', 'console', src + "\nreturn { runCreditCardImport }; ");

  const mockGlobalThis = {};
  const funcs = fn(requireShim, mockGlobalThis, console);
  const res = funcs.runCreditCardImport();

  expect(res.success).toBe(false);
  expect(res.error).toBe('simulated-quota-cc');
  expect(res.code).toBe('SIM_QUOTA_CC');
  expect(res.details).toEqual({ info: 'quota' });
});

test('importReceiptsFromFolder wrapper returns structured WorkflowError response when quota guard aborts', () => {
  const srcPath = path.join(__dirname, '..', '..', '..', 'src', 'workflows', 'receipts', 'receipt_import.js');
  let src = fs.readFileSync(srcPath, 'utf8');

  src = src.replace(
    'function _importReceiptsFromFolder(deps) {',
    "function _importReceiptsFromFolder(deps) { var errs = require('../../src/errors'); throw new errs.WorkflowError('simulated-quota-r','SIM_QUOTA_R',{info:'quota-r'});",
  );

  const requireShim2 = (p) => {
    try {
      if (p.startsWith('.')) return require(path.join(path.dirname(srcPath), p));
      if (p.startsWith('..')) return require(path.join(path.dirname(srcPath), p));
      return require(p);
    } catch (e) {
      if (p.endsWith('errors') || p.includes('/errors')) {
        return require(path.join(__dirname, '..', '..', '..', 'src', 'core', 'errors'));
      }
      if (p.endsWith('runtime-ids') || p.includes('/runtime-ids')) {
        return require(path.join(__dirname, '..', '..', '..', 'src', 'core', 'runtime-ids'));
      }
      if (p.includes('shared/schema')) {
        return require(path.join(__dirname, '..', '..', '..', 'shared', 'schema'));
      }
      const alt = path.join(__dirname, '..', '..', '..', 'src', p.replace(/^\.\//, ''));
      return require(alt);
    }
  };

  const fn = new Function('require', 'globalThis', 'console', src + "\nreturn { importReceiptsFromFolder }; ");

  const mockGlobalThis = {};
  const funcs = fn(requireShim2, mockGlobalThis, console);
  const res = funcs.importReceiptsFromFolder();

  expect(res.success).toBe(false);
  expect(res.error).toBe('simulated-quota-r');
  expect(res.code).toBe('SIM_QUOTA_R');
  expect(res.details).toEqual({ info: 'quota-r' });
});

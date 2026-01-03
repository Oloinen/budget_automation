function makeMockAdapter(initialValues = {}) {
  let config = null;
  if (typeof require === 'function') {
    try {
      config = require('../../src/config');
    } catch (e) {
      config = null;
    }
  }
  const state = { appended: [], updated: [], values: Object.assign({}, initialValues) };

  // Map sheet name -> header array from config (if available)
  const headerMap = {};
  if (config) {
    try {
      headerMap[config.TAB_TRANSACTIONS_READY] = config.HEADERS_TRANSACTIONS_READY;
      headerMap[config.TAB_CC_STAGING] = config.HEADERS_CC_STAGING;
      headerMap[config.TAB_MERCHANT_RULES] = config.HEADERS_MERCHANT_RULES;
      headerMap[config.TAB_CC_SKIPPED] = config.HEADERS_CC_SKIPPED;
      headerMap[config.TAB_MERCHANTS_UNKNOWN] = config.HEADERS_UNKNOWN_MERCHANTS;
      headerMap[config.TAB_RECEIPT_STAGING] = config.HEADERS_RECEIPT_STAGING;
      headerMap[config.TAB_RECEIPT_FILES] = config.HEADERS_RECEIPT_FILES;
      headerMap[config.TAB_ITEM_RULES] = config.HEADERS_ITEM_RULES;
      headerMap[config.TAB_UNKNOWN_ITEMS] = config.HEADERS_UNKNOWN_ITEMS;
    } catch (e) {
      // ignore
    }
  }

  async function getValues(spreadsheetId, range) {
    // keys are simple ranges; tests can prefill state.values[range] = [[row1], [row2], ...]
    const dataRows = state.values[range] || [];
    const headers = headerMap[range];
    if (headers && headers.length) {
      return [headers].concat(dataRows);
    }
    return dataRows;
  }

  async function appendRows(spreadsheetId, range, rows) {
    state.appended.push({ spreadsheetId, range, rows });
    return { spreadsheetId, range, rows };
  }

  async function updateValues(spreadsheetId, range, rows) {
    state.updated.push({ spreadsheetId, range, rows });
    return { spreadsheetId, range, rows };
  }

  async function copyFile(fileId, destName) {
    const id = `mock-copy-${Date.now()}`;
    return { id, name: destName };
  }

  async function runScript(scriptId, functionName, parameters = []) {
    // default: return an empty outputs object; tests can override by setting state.runScriptResult
    return state.runScriptResult || { response: { result: { outputs: {} } } };
  }

  return { state, getValues, appendRows, updateValues, copyFile, runScript };
}

module.exports = { makeMockAdapter };

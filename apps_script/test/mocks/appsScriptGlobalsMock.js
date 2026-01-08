/**
 * Mock Apps Script global objects for testing
 * Provides mock implementations of DriveApp, SpreadsheetApp, PropertiesService, etc.
 */

/**
 * Creates a mock spreadsheet with sheet tracking
 */
function makeMockSpreadsheet() {
  const sheetsData = {};
  
  const getHeadersForSheet = (name) => {
    const headerMap = {
      "transactions_ready": global.HEADERS_TRANSACTIONS_READY,
      "receipt_staging": global.HEADERS_RECEIPT_STAGING,
      "receipt_files": global.HEADERS_RECEIPT_FILES,
      "item_rules": global.HEADERS_ITEM_RULES,
      "unknown_items": global.HEADERS_UNKNOWN_ITEMS
    };
    return headerMap[name];
  };

  return {
    getSheetByName: (name) => {
      if (!sheetsData[name]) {
        sheetsData[name] = {
          _name: name,
          _data: [],
          appendRow: function(row) {
            this._data.push(row);
          },
          getDataRange: function() {
            return {
              getValues: () => {
                const headers = getHeadersForSheet(name);
                return headers ? [headers, ...this._data] : this._data;
              }
            };
          },
          getRange: function(row, col, numRows, numCols) {
            return {
              getValues: () => {
                const headers = getHeadersForSheet(name);
                return headers ? [headers] : [[]];
              },
              setValues: (vals) => {},
              setValue: (val) => {}
            };
          },
          setFrozenRows: () => {}
        };
      }
      return sheetsData[name];
    },
    insertSheet: function(name) {
      return this.getSheetByName(name);
    },
    _getAllSheets: () => sheetsData
  };
}

/**
 * Creates a mock Drive folder with files
 */
function makeMockFolder(files) {
  let fileIndex = 0;
  return {
    getFiles: () => ({
      hasNext: () => fileIndex < files.length,
      next: () => {
        const file = files[fileIndex++];
        return file;
      }
    }),
    _reset: () => { fileIndex = 0; }
  };
}

/**
 * Creates mock file objects
 */
function makeMockFiles() {
  return [
    {
      getId: () => "file-001",
      getName: () => "receipt1.pdf",
      getMimeType: () => "application/pdf"
    },
    {
      getId: () => "file-002",
      getName: () => "receipt2.jpg",
      getMimeType: () => "image/jpeg"
    },
    {
      getId: () => "file-003",
      getName: () => "receipt3.png",
      getMimeType: () => "image/png"
    },
    {
      getId: () => "file-004",
      getName: () => "not-a-receipt.txt",
      getMimeType: () => "text/plain"
    }
  ];
}

/**
 * Creates mock script properties
 */
function makeMockProperties() {
  const props = {};
  return {
    getProperty: (key) => props[key] || null,
    setProperty: (key, val) => { props[key] = val; },
    deleteProperty: (key) => { delete props[key]; },
    deleteAllProperties: () => { Object.keys(props).forEach(k => delete props[k]); },
    getProperties: () => ({ ...props }),
    _getAll: () => props
  };
}

/**
 * Creates mock UrlFetchApp with configurable responses
 */
function makeMockUrlFetchApp(responseHandler) {
  const requestLog = [];
  
  return {
    fetch: (url, options) => {
      const request = {
        url,
        options,
        payload: options.payload ? JSON.parse(options.payload) : null
      };
      requestLog.push(request);
      
      const response = responseHandler ? responseHandler(request) : {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ ok: true })
      };
      
      return response;
    },
    _getRequestLog: () => requestLog,
    _clearLog: () => { requestLog.length = 0; }
  };
}

/**
 * Sets up all Apps Script global mocks
 */
function setupAppsScriptGlobals(options = {}) {
  const {
    mockFiles = makeMockFiles(),
    cloudFunctionResponse = null,
    customResponseHandler = null
  } = options;

  const mockSpreadsheet = makeMockSpreadsheet();
  const mockFolder = makeMockFolder(mockFiles);
  const mockProps = makeMockProperties();
  
  const defaultResponseHandler = (request) => {
    if (cloudFunctionResponse) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(cloudFunctionResponse)
      };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ ok: true })
    };
  };
  
  const mockUrlFetchApp = makeMockUrlFetchApp(customResponseHandler || defaultResponseHandler);

  // Set up global mocks
  global.DriveApp = {
    getFolderById: () => mockFolder
  };

  global.SpreadsheetApp = {
    getActive: () => mockSpreadsheet
  };

  global.PropertiesService = {
    getScriptProperties: () => mockProps
  };

  global.Utilities = {
    getUuid: () => `uuid-${Date.now()}-${Math.random()}`,
    formatDate: (date, tz, format) => {
      const d = new Date(date);
      return d.toISOString().substring(0, 19).replace('T', 'T');
    }
  };

  global.Session = {
    getScriptTimeZone: () => "Europe/Helsinki"
  };

  global.UrlFetchApp = mockUrlFetchApp;

  global.ScriptApp = {
    getIdentityToken: () => "mock-token-12345"
  };

  // Set up config constants
  global.RECEIPTS_FOLDER_ID = "mock-folder-id";
  global.TAB_TRANSACTIONS_READY = "transactions_ready";
  global.TAB_RECEIPT_STAGING = "receipt_staging";
  global.TAB_RECEIPT_FILES = "receipt_files";
  global.TAB_ITEM_RULES = "item_rules";
  global.TAB_UNKNOWN_ITEMS = "unknown_items";
  global.HEADERS_TRANSACTIONS_READY = ["tx_id","date","month","merchant","amount","group","category","posted_at","source"];
  global.HEADERS_RECEIPT_STAGING = ["tx_id","date","receipt_id","merchant","amount","raw_ocr","group","category","posted_at","status"];
  global.HEADERS_RECEIPT_FILES = ["receipt_id","file_id","file_name","imported_at","status","detected_date","detected_merchant","detected_amount","is_verified","note"];
  global.HEADERS_ITEM_RULES = ["pattern","group","category","mode"];
  global.HEADERS_UNKNOWN_ITEMS = ["pattern","group","category","mode","count","first_seen","last_seen"];

  return {
    mockSpreadsheet,
    mockFolder,
    mockProps,
    mockUrlFetchApp,
    mockFiles
  };
}

module.exports = {
  makeMockSpreadsheet,
  makeMockFolder,
  makeMockFiles,
  makeMockProperties,
  makeMockUrlFetchApp,
  setupAppsScriptGlobals
};

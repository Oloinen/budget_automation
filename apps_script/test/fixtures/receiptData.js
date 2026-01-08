/**
 * Fixture helpers for receipt-related test data
 * Pure data is in JSON files (itemRules.json, expectedRows.json, receiptItems.json)
 * This file contains mock objects with methods (receiptFiles)
 */

const itemRules = require('./itemRules.json');
const expectedRows = require('./expectedRows.json');
const receiptItems = require('./receiptItems.json');

/**
 * Sample file data for mock Drive files
 * These have methods (getId, getName, getMimeType) so they stay in JS
 */
const receiptFiles = {
  pdf: {
    getId: () => "pdf-file-123",
    getName: () => "receipt_20260105.pdf",
    getMimeType: () => "application/pdf"
  },
  
  jpg: {
    getId: () => "jpg-file-456",
    getName: () => "receipt_20260106.jpg",
    getMimeType: () => "image/jpeg"
  },
  
  png: {
    getId: () => "png-file-789",
    getName: () => "receipt_20260107.png",
    getMimeType: () => "image/png"
  },
  
  unsupported: {
    getId: () => "txt-file-000",
    getName: () => "notes.txt",
    getMimeType: () => "text/plain"
  }
};

/**
 * Sample cursor states for testing resumable processing
 */
const cursorStates = {
  initial: null,
  midProcess: "receipt2.jpg",
  almostDone: "receipt9.pdf",
  complete: "zzz_last_file.pdf"
};

module.exports = {
  itemRules,
  receiptFiles,
  expectedRows,
  receiptItems,
  cursorStates
};

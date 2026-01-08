/**
 * Fixture helpers for Cloud Function responses
 * Pure data responses are in cloudFunctionResponses.json
 * This file contains factory functions for creating dynamic responses
 */

const responses = require("./cloudFunctionResponses.json");

/**
 * Creates a mock HTTP error response (for UrlFetchApp)
 */
function makeHttpErrorResponse(statusCode, errorMessage) {
  return {
    getResponseCode: () => statusCode,
    getContentText: () => errorMessage,
  };
}

/**
 * Creates a custom Cloud Function response
 */
function makeCloudFunctionResponse(options = {}) {
  const {
    ok = true,
    date = "2026-01-05",
    merchant = "K-Market",
    total = 10.0,
    items = [],
    raw_text = "",
    error = null,
  } = options;

  if (!ok) {
    return { ok: false, error: error || "Unknown error" };
  }

  return {
    ok: true,
    result: {
      date,
      merchant,
      total,
      items,
      raw_text: raw_text || `${merchant}\n${date}\nYHTEENSÄ ${total}`,
      currency: "EUR",
    },
  };
}

module.exports = {
  // Export pre-built responses from JSON
  ...responses,
  // Export factory functions
  makeHttpErrorResponse,
  makeCloudFunctionResponse,
};

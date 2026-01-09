/*
 * Wrapper for Apps Script PropertiesService with Node fallback.
 */

function getScriptProperty(key, fallback) {
  if (typeof fallback === "undefined") fallback = "";
  // Apps Script environment
  if (typeof PropertiesService !== "undefined") {
    try {
      var value = PropertiesService.getScriptProperties().getProperty(key);
      return value !== null ? value : fallback;
    } catch (err) {
      return fallback;
    }
  }
  // Node.js test environment - check global first, then process.env
  if (typeof global !== "undefined" && global[key]) return global[key];
  if (typeof process !== "undefined" && process.env && process.env[key]) return process.env[key];
  return fallback;
}

module.exports = { getScriptProperty };

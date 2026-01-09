/**
 * General utilities - rounding, date formatting, API quota management
 */

function roundValue(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function toIso(d) {
  // Apps Script Date -> ISO-like string in spreadsheet-friendly format
  if (typeof Utilities !== "undefined" && typeof Session !== "undefined") {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }
  // Node.js fallback
  return d
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replace("T", "T");
}

function toMonth(yyyyMmDd) {
  // expects "YYYY-MM-DD"
  if (!yyyyMmDd || typeof yyyyMmDd !== "string" || yyyyMmDd.length < 7) return "";
  return yyyyMmDd.substring(0, 7); // "YYYY-MM"
}

function truncate(s, maxLen) {
  const str = String(s ?? "");
  return str.length <= maxLen ? str : str.substring(0, maxLen);
}

/**
 * Simple API quota guard using Script Properties.
 * - Resets daily counter based on script timezone
 * - Increments counter and throws when approaching threshold
 *
 * Options (via global constants or env):
 *  - API_QUOTA_DAILY_LIMIT (number) default 750
 *  - API_QUOTA_WARNING_THRESHOLD (number) default 500
 */
function checkApiQuota() {
  try {
    if (typeof PropertiesService === "undefined") return;
    const props = PropertiesService.getScriptProperties();
    const tz =
      typeof Session !== "undefined" && Session.getScriptTimeZone
        ? Session.getScriptTimeZone()
        : "UTC";
    const today =
      typeof Utilities !== "undefined"
        ? Utilities.formatDate(new Date(), tz, "yyyy-MM-dd")
        : new Date().toISOString().slice(0, 10);

    const lastReset = props.getProperty("quota_reset_date");
    if (lastReset !== today) {
      props.setProperty("quota_reset_date", today);
      props.setProperty("api_requests_today", "0");
    }

    const raw = props.getProperty("api_requests_today") || "0";
    const count = parseInt(raw || "0", 10) || 0;

    const dailyLimit = Number(
      props.getProperty("API_QUOTA_DAILY_LIMIT") || global.API_QUOTA_DAILY_LIMIT || 750,
    );
    const warnThreshold = Number(
      props.getProperty("API_QUOTA_WARNING_THRESHOLD") || global.API_QUOTA_WARNING_THRESHOLD || 500,
    );

    if (count >= dailyLimit) {
      throw new Error(`API quota exceeded: ${count} >= ${dailyLimit}`);
    }
    if (count >= warnThreshold) {
      // soft warning: throw to stop heavy imports
      throw new Error(`Approaching API quota limit: ${count}/${dailyLimit}`);
    }

    props.setProperty("api_requests_today", String(count + 1));
  } catch (e) {
    // If PropertiesService not available in environment (e.g., some tests), ignore
    if (typeof PropertiesService === "undefined") return;
    throw e;
  }
}

module.exports = {
  roundValue,
  toIso,
  toMonth,
  truncate,
  checkApiQuota,
};

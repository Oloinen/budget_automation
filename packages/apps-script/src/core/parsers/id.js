/**
 * ID generation utilities - transaction IDs, hashing
 */

function makeTxId(payload) {
  if (typeof Utilities !== "undefined" && Utilities.computeDigest) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(payload));
    return bytes
      .map((b) => ("0" + (b & 0xff).toString(16)).slice(-2))
      .join("")
      .slice(0, 24);
  }
  // Node fallback
  try {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(String(payload)).digest("hex");
    return String(hash).slice(0, 24);
  } catch (e) {
    // Last-resort: simple hex of utf8 payload
    return Buffer.from(String(payload), "utf8").toString("hex").slice(0, 24);
  }
}

module.exports = {
  makeTxId,
};

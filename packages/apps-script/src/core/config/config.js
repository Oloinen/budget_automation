/**
 * Central config module for Apps Script and Node test environments.
 *
 * Precedence (low -> high): Script PropertiesService -> process.env -> ../config.local.js
 * Exposes `get(key, defaultValue)`, `getBoolean(key, defaultValue)`, and `all()`.
 */

function readPropertiesService() {
  if (typeof PropertiesService === "undefined" || !PropertiesService.getScriptProperties) return {};
  const props = PropertiesService.getScriptProperties().getProperties();
  return props || {};
}

function readProcessEnv() {
  if (typeof process === "undefined" || !process.env) return {};
  const out = {};
  Object.keys(process.env).forEach((key) => {
    out[key] = process.env[key];
  });
  return out;
}

function readLocalOverride() {
  // Only attempt filesystem-based resolution in Node.js
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    const fs = require("fs");
    const path = require("path");
    const configPath = path.join(__dirname, "..", "config.local.js");
    if (fs.existsSync(configPath)) {
      // eslint-disable-next-line global-require
      const local = require(configPath);
      if (local && typeof local === "object") return local;
    }
    return {};
  }
  // Non-Node environments (Apps Script) do not support local overrides
  return {};
}

function mergeConfigs(...sources) {
  const out = {};
  sources.forEach((src) => {
    if (!src) return;
    Object.keys(src).forEach((key) => {
      out[key] = src[key];
    });
  });
  return out;
}

const props = readPropertiesService();
const env = readProcessEnv();
const local = readLocalOverride();

// precedence: props <- env <- local (local overrides env overrides props)
const merged = mergeConfigs(props, env, local);

function get(key, defaultValue) {
  if (Object.prototype.hasOwnProperty.call(merged, key)) return merged[key];
  return defaultValue;
}

function getBoolean(key, defaultValue) {
  const value = get(key);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const str = value.trim().toLowerCase();
    if (str === "true" || str === "1" || str === "yes") return true;
    if (str === "false" || str === "0" || str === "no") return false;
  }
  return defaultValue;
}

function all() {
  return Object.assign({}, merged);
}

const Config = { get, getBoolean, all };

// CommonJS export for Node/Jest
if (typeof module !== "undefined" && module.exports) {
  module.exports = Config;
}

// Attach to global for Apps Script runtime consumers
if (typeof this !== "undefined" && !this.Config) {
  this.Config = Config;
}

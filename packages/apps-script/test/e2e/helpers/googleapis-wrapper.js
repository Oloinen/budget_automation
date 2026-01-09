// Wrapper to choose real googleapis or the local mock via config
const { loadConfig } = require("./load_config");
const cfg = loadConfig();
if (cfg.mockGoogleApi) {
  module.exports = require("./googleapis.mock");
} else {
  module.exports = require("googleapis");
}

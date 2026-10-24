const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
// Pure V1 docket modules are shared with the website, not copied into mobile.
config.watchFolders = [path.resolve(__dirname, "..")];
module.exports = config;

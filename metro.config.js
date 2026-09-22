const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build loads its SQLite engine as a .wasm asset — Metro
// needs to treat it as a binary asset rather than trying to parse it as JS.
config.resolver.assetExts.push('wasm');

module.exports = config;

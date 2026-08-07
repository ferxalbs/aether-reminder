const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// In Expo Go, expo-audio's native module is not available and crashes at startup.
// Redirect 'expo-audio' to a safe no-op shim so the app loads cleanly.
// When running a dev build (expo run:android / eas build), remove or comment out
// the alias below so the real native module is used.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-audio': path.resolve(__dirname, 'src/lib/expo-audio-shim.ts'),
};

module.exports = config;

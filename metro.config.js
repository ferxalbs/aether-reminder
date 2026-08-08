const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
const expoAudioShim = path.resolve(__dirname, "src/lib/expo-audio-shim.ts");

// Only force the expo-audio shim when explicitly requested.
// Real native recording requires a dev client / production build with expo-audio.
// Set EXPO_AUDIO_SHIM=1 for Expo Go sessions where the native module crashes.
// Default: use the real module so permission/recording failures are honest.
const forceAudioShim = process.env.EXPO_AUDIO_SHIM === "1";

if (forceAudioShim) {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "expo-audio") {
      return {
        type: "sourceFile",
        filePath: expoAudioShim,
      };
    }

    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;

// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const { fixupConfigRules } = require("@eslint/compat");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  ...fixupConfigRules(expoConfig),
  {
    ignores: ["dist/*"],
  },
]);

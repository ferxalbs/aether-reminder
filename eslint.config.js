// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const { fixupConfigRules } = require("@eslint/compat");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  ...fixupConfigRules(expoConfig),
  {
    ignores: ["dist/*"],
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Alert"],
              message:
                "Use the canonical AetherAlertDialog adapter for app-owned alerts.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='Alert'][callee.property.name='alert']",
          message:
            "Use the canonical AetherAlertDialog adapter for app-owned alerts.",
        },
      ],
    },
  },
]);

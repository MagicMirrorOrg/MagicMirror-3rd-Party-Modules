import { defineConfig } from "eslint/config";
import depend from "eslint-plugin-depend";
import globals from "globals";
import { flatConfigs as importX } from "eslint-plugin-import-x";
import js from "@eslint/js";
import packageJson from "eslint-plugin-package-json";

export default defineConfig([
  {
    ignores: ["**/*.min.js"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
        config: "readonly",
        Log: "readonly",
        MM: "readonly",
        Module: "readonly",
        moment: "readonly",
        Temporal: "readonly"
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off"
    },
    plugins: { js },
    extends: [importX.recommended, "js/recommended"],
    rules: {
      "import-x/no-unresolved": "off",
      "no-prototype-builtins": "off",
      "no-redeclare": "off",
      "no-undef": "off"
    }
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
        Temporal: "readonly"
      },
      sourceType: "module"
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off"
    },
    plugins: { js },
    extends: [importX.recommended, "js/recommended"],
    rules: {
      "import-x/no-unresolved": "off"
    }
  },
  {
    files: ["**/package.json"],
    plugins: { depend, packageJson },
    extends: ["packageJson/recommended"],
    rules: {
      "depend/ban-dependencies": ["error", { allowed: ["lint-staged", "moment"] }],
      "package-json/require-type": "error",
      "package-json/order-properties": "off",
      "package-json/require-exports": "off",
      "package-json/require-files": "off",
      "package-json/require-sideEffects": "off",
      "package-json/sort-collections": [
        "error",
        [
          "config",
          "dependencies",
          "devDependencies",
          "exports",
          "optionalDependencies",
          "overrides",
          "peerDependencies",
          "peerDependenciesMeta"
        ]
      ]
    }
  }
]);

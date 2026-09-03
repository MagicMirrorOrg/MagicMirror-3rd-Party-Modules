import css from "@eslint/css";
import { defineConfig } from "eslint/config";
import globals from "globals";
import { flatConfigs as importX } from "eslint-plugin-import-x";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import packageJson from "eslint-plugin-package-json";
import stylistic from "@stylistic/eslint-plugin";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "fixtures/**",
      "modules/*",
      "modules_temp/*",
      "website/data/modules*.json",
      "website/fonts/*",
      "website/result.html",
      "website/result.md",
      "website/test/3rd-Party-Modules.md",
      "website/vendor/*"
    ]
  },
  {
    files: ["**/*.css"],
    languageOptions: { tolerant: true },
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
    rules: {
      "css/no-important": "off",
      "css/no-invalid-properties": "off",
      "css/use-baseline": ["error", { available: "newly" }]
    }
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser
      }
    },
    plugins: { js, stylistic },
    extends: [importX.recommended, "js/all", stylistic.configs.customize({ indent: "tab", quotes: "double", semi: true, commaDangle: "never" })],
    rules: {
      "@stylistic/array-element-newline": ["error", "consistent"],
      "@stylistic/dot-location": ["error", "property"],
      "@stylistic/function-call-argument-newline": ["error", "consistent"],
      "@stylistic/implicit-arrow-linebreak": "off",
      "@stylistic/indent": ["error", 2],
      "@stylistic/multiline-ternary": "off",
      "@stylistic/object-property-newline": ["error", { allowAllPropertiesOnSameLine: true }],
      "@stylistic/padded-blocks": ["error", "never"],
      "@stylistic/quote-props": ["error", "as-needed"],
      camelcase: "off",
      complexity: "off",
      "default-case": "off",
      "func-style": "off",
      "id-length": ["error", { exceptions: ["a", "b"] }],
      "import-x/no-unresolved": ["error", { ignore: ["eslint/config", "logger"] }],
      "init-declarations": "off",
      "max-depth": ["warn", 5],
      "max-lines": ["warn", 500],
      "max-lines-per-function": ["warn", 150],
      "max-params": ["warn", 5],
      "max-statements": ["warn", 60],
      "no-await-in-loop": "off",
      "no-console": "off",
      "no-inline-comments": "off",
      "no-magic-numbers": "off",
      "no-param-reassign": "off",
      "no-ternary": "off",
      "no-use-before-define": "off",
      "one-var": "off",
      "prefer-destructuring": "off",
      "prefer-named-capture-group": "off",
      "require-atomic-updates": "off",
      "sort-keys": "off"
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node
      },
      parser: tseslint.parser,
      parserOptions: {
        projectService: true
      }
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "@stylistic": stylistic
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs.stylistic.rules,
      "@typescript-eslint/no-explicit-any": "warn"
    }
  },
  {
    files: ["pipeline/workers/**/*.js"],
    rules: {
      "max-lines": ["warn", 900],
      "max-lines-per-function": ["warn", 200],
      "max-depth": ["warn", 6]
    }
  },
  {
    files: ["website/*.js"],
    languageOptions: {
      sourceType: "module"
    }
  },
  { files: ["**/*.json"], ignores: ["package.json", "package-lock.json"], plugins: { json }, extends: ["json/recommended"], language: "json/json" },
  { files: ["package.json"], plugins: { packageJson }, extends: ["packageJson/recommended"], rules: { "package-json/sort-collections": "off", "package-json/require-files": "off", "package-json/require-sideEffects": "off" } },
  { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm", extends: ["markdown/recommended"] }
]);

import eslintPluginDepend from "eslint-plugin-depend";
import eslintPluginImport from "eslint-plugin-import";
import eslintPluginJs from "@eslint/js";
import eslintPluginJson from "@eslint/json";
import eslintPluginPackageJson from "eslint-plugin-package-json/configs/recommended";
import eslintPluginStylistic from "@stylistic/eslint-plugin";
import globals from "globals";

const config = [
  eslintPluginDepend.configs["flat/recommended"],
  eslintPluginImport.flatConfigs.recommended,
  eslintPluginJs.configs.all,
  {
    "ignores": [
      "modules/*",
      "modules_temp/*",
      "docs/data/modules*.json",
      "docs/fonts/*",
      "result.md"
    ]
  },
  {
    "files": ["**/*.json"],
    "ignores": ["package-lock.json"],
    "language": "json/json",
    ...eslintPluginJson.configs.recommended,
    "rules": {
      "logical-assignment-operators": "off",
      "max-lines-per-function": "off",
      "no-irregular-whitespace": "off"
    }
  },
  {
    "files": ["**/*.js"],
    "languageOptions": {
      "ecmaVersion": "latest",
      "globals": {
        ...globals.browser
      },
      "sourceType": "module"
    },
    "plugins": {
      ...eslintPluginStylistic.configs["all-flat"].plugins
    },
    "rules": {
      ...eslintPluginJs.configs.all.rules,
      ...eslintPluginStylistic.configs["all-flat"].rules,
      "complexity": "off",
      "depend/ban-dependencies": ["error", {"allowed": ["moment", "eslint-plugin-import"]}],
      "func-style": "off",
      "id-length": ["error", {"exceptions": ["a", "b"]}],
      "import/no-unresolved": "off",
      "max-depth": ["warn", 5],
      "max-lines": ["warn", 500],
      "max-lines-per-function": ["warn", 150],
      "max-params": ["warn", 5],
      "max-statements": "off",
      "no-await-in-loop": "off",
      "no-console": "off",
      "no-magic-numbers": "off",
      "no-param-reassign": "off",
      "no-ternary": "off",
      "no-use-before-define": "off",
      "one-var": "off",
      "prefer-destructuring": "off",
      "prefer-named-capture-group": "off",
      "require-atomic-updates": "off",
      "sort-keys": "off",
      "@stylistic/array-element-newline": ["error", "consistent"],
      "@stylistic/dot-location": ["error", "property"],
      "@stylistic/function-call-argument-newline": ["error", "consistent"],
      "@stylistic/implicit-arrow-linebreak": "off",
      "@stylistic/indent": ["error", 2],
      "@stylistic/multiline-ternary": "off",
      "@stylistic/object-property-newline": "off",
      "@stylistic/padded-blocks": ["error", "never"]
    }
  },
  {
    "files": ["**/package.json"],
    ...eslintPluginPackageJson,
    "rules": {
      ...eslintPluginPackageJson.rules,
      "package-json/sort-collections": "off"
    }
  }
];

export default config;

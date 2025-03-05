import eslintPluginDepend from "eslint-plugin-depend";
import eslintPluginImport from "eslint-plugin-import";
import eslintPluginJs from "@eslint/js";
import eslintPluginPackageJson from "eslint-plugin-package-json/configs/recommended";
import globals from "globals";

const config = [
  eslintPluginDepend.configs["flat/recommended"],
  eslintPluginImport.flatConfigs.recommended,
  eslintPluginJs.configs.recommended,
  eslintPluginPackageJson,
  {
    "ignores": ["**/*.min.js"]
  },
  {
    "files": ["**/*.js"],
    "languageOptions": {
      "ecmaVersion": "latest",
      "globals": {
        ...globals.browser,
        ...globals.node,
        "config": "readonly",
        "Log": "readonly",
        "MM": "readonly",
        "Module": "readonly",
        "moment": "readonly"
      },
      "sourceType": "commonjs"
    },
    "linterOptions": {
      "reportUnusedDisableDirectives": "off"
    },
    "rules": {
      "depend/ban-dependencies": ["error", {"allowed": ["moment", "eslint-plugin-import"]}],
      "import/no-unresolved": "off",
      "no-prototype-builtins": "off",
      "no-redeclare": "off",
      "no-undef": "off"
    }
  },
  {
    "files": ["**/*.mjs"],
    "languageOptions": {
      "ecmaVersion": "latest",
      "globals": {
        ...globals.node
      },
      "sourceType": "module"
    },
    "linterOptions": {
      "reportUnusedDisableDirectives": "off"
    },
    "rules": {
      "depend/ban-dependencies": ["error", {"allowed": ["moment", "eslint-plugin-import"]}],
      "import/no-unresolved": "off"
    }
  },
  {
    "files": ["package.json"],
    "rules": {
      "depend/ban-dependencies": ["error", {"allowed": ["moment", "eslint-plugin-import"]}],
      "package-json/order-properties": "off",
      "package-json/require-author": "error",
      "package-json/require-keywords": "error"
    }
  }
];

export default config;

# How to use ESLint for your MagicMirror² module

A linter helps catch errors and enforce coding standards in JavaScript. ESLint can be integrated into your module.

If you want to better understand how to setup ESLint all by yourself, check out the [ESLint documentation](https://eslint.org/docs/latest/use/getting-started).

## Guide to using ESLint for your MagicMirror² module

This guide will help you set up ESLint for your MagicMirror² module. It will cover the installation of ESLint, configuration, and how to run it. There are many other options and configurations available, but this guide will focus on a basic setup that should work for most modules.

### 0 - Prerequisites

- Make sure you have a `package.json` file in your module's root directory. If you don't have one, you can create it by running `npm init -y` in your terminal.
- Make sure you have a `.gitignore` file in your module's root directory. If you don't have one, you can create it by running `touch .gitignore` in your terminal.
- Add `node_modules/` to `.gitignore` to avoid committing installed dependencies.

### 1 - Install necessary packages

You can install ESLint and the necessary plugins using npm. Run the following command in your terminal:

```bash
npm install --save-dev eslint @eslint/js globals
```

### 2 - Create ESLint configuration file

Create a file named `eslint.config.mjs` in the root directory of your module. This file will contain the configuration for ESLint.

Add a `eslint.config.mjs` file to the top directory with the following text:

```js
import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";

export default defineConfig([
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        Log: "readonly",
        Module: "readonly",
        config: "readonly"
      },
      sourceType: "commonjs"
    }
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node
      },
      sourceType: "module"
    }
  }
]);
```

### 3 - Add linting scripts to `package.json`

Add the following scripts to your `package.json` file:

```json
{
  "scripts": {
    "lint": "eslint",
    "lint:fix": "eslint --fix"
  }
}
```

### 4 - Add ESLint to your development workflow (optional)

#### A - Run it automatically before committing (recommended)

If you want to run ESLint automatically before committing any changes, you can use [simple-git-hooks](https://github.com/toplenboren/simple-git-hooks) to set up a pre-commit hook and [lint-staged](https://www.npmjs.com/package/lint-staged) to only lint staged files. This will help ensure that your code is always linted before it is committed.

To set this up, first install `simple-git-hooks` and `lint-staged` as development dependencies:

```bash
npm install --save-dev simple-git-hooks lint-staged
```

Then, add the following configuration to your `package.json` file:

```json
  "lint-staged": {
    "*.{js,mjs}": "eslint --fix"
  },
  "simple-git-hooks": {
    "pre-commit": "npx lint-staged"
  }
```

And also in the `package.json` file, add the following lines to the `scripts` section:

```json
  "scripts": {
    "prepare": "simple-git-hooks"
  }
```

Apply the hook configuration by running the following command in your terminal:

```bash
node --run prepare
```

This will set up `simple-git-hooks` to run the `lint-staged` command before committing any changes. The `lint-staged` command will only lint the files that are staged for commit, which can save time and resources. If you change the `simple-git-hooks` configuration later, run `node --run prepare` again to update the hooks.

#### B - Run it manually before committing (optional)

You can run ESLint manually by executing the following command in your terminal:

```bash
node --run lint
```

This will check your code for linting errors. If you want to automatically fix any fixable linting errors, you can run:

```bash
node --run lint:fix
```

This will automatically fix any linting errors that can be fixed.

Make sure to run these commands before committing your code to ensure that your code adheres to the defined coding standards.

### 4.1 - Add ESLint commands to your README (optional)

Add the following section to your `README.md` file to inform other developers about the linting setup:

```markdown
## Developer commands

- `node --run lint` - Run linting checks.
- `node --run lint:fix` - Fix automatically fixable linting errors.
```

### 5 - Add GitHub Actions workflow (optional)

If you want to run ESLint automatically on every push or pull request, you can set up a GitHub Actions workflow. This will help ensure that your code is always linted and follows the defined coding standards.

Commit your `package-lock.json` so the workflow can install dependencies with `npm ci`. Create `.github/workflows/automated-tests.yaml` with the following content:

```yaml
name: Automated Tests
on:
  push:
    branches: [main, develop] # <<<< change "main" to "master" if you have an old repository
  pull_request:
    branches: [main, develop] # <<<< change "main" to "master" if you have an old repository

permissions:
  contents: read

jobs:
  run-lint:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check out repository code
        uses: actions/checkout@v7
      - name: Use Node.js
        uses: actions/setup-node@v7
        with:
          node-version: lts/*
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Check linting
        run: node --run lint
```

### 6 - Add ESLint to your editor - optional

To make your development experience even better, you can integrate ESLint into your code editor. Most popular code editors have ESLint plugins or extensions that will highlight linting errors in real-time as you write your code.

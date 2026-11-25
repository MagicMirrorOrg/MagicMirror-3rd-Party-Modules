# How to use Biome for your MagicMirror² module

A linter helps catch errors and enforce coding standards in JavaScript. Biome handles both linting and formatting.

If you want to better understand how to set up Biome by yourself, check out the [Biome documentation](https://biomejs.dev/guides/getting-started/).

## Guide to using Biome for your MagicMirror² module

This guide will help you set up Biome for your MagicMirror² module. It will cover the installation, configuration, and how to run it.

### 0 - Prerequisites

- Make sure you have a `package.json` file in your module's root directory. If you don't have one, you can create it by running `npm init -y` in your terminal.
- Make sure you have a `.gitignore` file in your module's root directory. If you don't have one, you can create it by running `touch .gitignore` in your terminal.
- Add `node_modules` to your `.gitignore` file to prevent committing the `node_modules` directory to your repository.

### 1 - Install Biome

Install Biome as a development dependency:

```bash
npm install --save-dev @biomejs/biome
```

### 2 - Create Biome configuration file

Create a file named `biome.jsonc` in the root directory of your module:

```json
{
  "linter": {
    "enabled": true
  },
  "formatter": {
    "enabled": true
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  }
}
```

### 3 - Add scripts to package.json

Add the following scripts to your `package.json` file:

```json
{
  "scripts": {
    "lint": "biome lint .",
    "lint:fix": "biome lint --write .",
    "format": "biome format --write .",
    "check": "biome check ."
  }
}
```

### 4 - Run Biome

Run linting:

```bash
node --run lint
```

Run linting with automatic fixes:

```bash
node --run lint:fix
```

Run formatting:

```bash
node --run format
```

Run all checks:

```bash
node --run check
```

import type { Issue } from "../check-modules/issue.ts";
import { getRepositoryId, getRepositoryType } from "../updateRepositoryApiData/helpers.ts";

export interface ParsedModuleEntry {
  category: string;
  description: string;
  id: string;
  issues: Issue[];
  maintainer: string;
  maintainerURL: string;
  name: string;
  outdated?: string;
  url: string;
}

export interface ParseModuleListResult {
  issues: string[];
  modules: ParsedModuleEntry[];
}

/**
 * Extract the maintainer URL from a repository URL.
 *
 * @param {string} url - The repository URL.
 * @returns {string} The maintainer URL or empty string if invalid.
 */
function getMaintainerURL(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 1) {
      return `${urlObj.origin}/${pathParts[0]}`;
    }
  }
  catch {
    // Invalid URL, return empty string
  }

  return "";
}

function isRepositoryRow(line: string): boolean {
  return (
    line.includes("](https://github.com/")
    || line.includes("](https://gitlab.com/")
    || line.includes("](https://bitbucket.org/")
    || line.includes("](https://codeberg.org/")
  );
}

function stripUrlTitle(url: string): string {
  const urlTitleStart = url.indexOf(" ");
  if (urlTitleStart === -1) {
    return url;
  }

  return url.substring(0, urlTitleStart);
}

function parseMarkdownLink(cell: string): { text: string; url: string } | null {
  const textStart = cell.indexOf("[");
  const textEnd = cell.indexOf("]", textStart + 1);
  const urlStart = cell.indexOf("(", textEnd + 1);
  const urlEnd = cell.indexOf(")", urlStart + 1);

  if (textStart === -1 || textEnd === -1 || urlStart === -1 || urlEnd === -1) {
    return null;
  }

  const text = cell.slice(textStart + 1, textEnd).trim();
  const url = stripUrlTitle(cell.slice(urlStart + 1, urlEnd).trim());
  if (!text || !url) {
    return null;
  }

  return { text, url };
}

function parseModuleRow(line: string, category: string, issues: string[]): ParsedModuleEntry | null {
  if (!isRepositoryRow(line)) {
    return null;
  }

  const parts = line.split("|").map(part => part.trim());
  if (parts.length < 3) {
    return null;
  }

  const repoCell = parts[1];
  const repoLink = parseMarkdownLink(repoCell);
  if (!repoLink) {
    return null;
  }

  const name = repoLink.text;
  const url = repoLink.url;
  const maintainerCell = parts[2] || "";
  const description = parts[3] || "";
  const outdatedInfo = parts[4] ? parts[4].trim() : "";

  let maintainer = maintainerCell;
  const maintainerLink = parseMarkdownLink(maintainerCell);
  if (maintainerLink) {
    maintainer = maintainerLink.text;
  }

  const repoType = getRepositoryType(url);
  if (repoType === "unknown") {
    issues.push(`Skipping unknown repository type: ${url}`);
    return null;
  }

  const id = getRepositoryId(url) || name.replace(/\s+/gu, "-");
  const maintainerURL = getMaintainerURL(url);
  const moduleEntry: ParsedModuleEntry = {
    name,
    url,
    id,
    description,
    maintainer,
    maintainerURL,
    category,
    issues: []
  };

  if (outdatedInfo.length > 0) {
    moduleEntry.outdated = outdatedInfo;
  }

  return moduleEntry;
}

/**
 * Parse the Markdown content into a list of module objects.
 *
 * @param {string} markdown - The raw Markdown content from the Wiki.
 * @returns {{modules: Array<object>, issues: Array<string>}} The parsed modules and any issues encountered.
 */
export function parseModuleList(markdown: string): ParseModuleListResult {
  const modules: ParsedModuleEntry[] = [];
  const issues: string[] = [];
  let category = "Unknown";

  const lines = markdown.split("\n");
  for (const line of lines) {
    if (line.startsWith("### ")) {
      category = line.replace("### ", "").trim();
    }
    else {
      const moduleEntry = parseModuleRow(line, category, issues);
      if (moduleEntry) {
        modules.push(moduleEntry);
      }
    }
  }

  return { modules, issues };
}

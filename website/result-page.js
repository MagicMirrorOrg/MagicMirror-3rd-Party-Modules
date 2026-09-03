import createDOMPurify from "./vendor/dompurify.mjs";
// eslint-disable-next-line import-x/no-unresolved
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

const DOMPurify = createDOMPurify(window);

function sanitizeMarkdownHtml(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown));
}

function normalizeModuleSlug(text) {
  return text
    .replaceAll(" ", "-")
    .replaceAll("&", "")
    .replaceAll("/", "");
}

function parseModuleHeadingText(line) {
  const linkedHeadingMatch = line.match(
    /^###\s+\[([^\]]+)\]\([^)]*\)\s*$/u
  );
  if (linkedHeadingMatch) {
    return linkedHeadingMatch[1];
  }

  const plainHeadingMatch = line.match(/^###\s+(.+)$/u);
  return plainHeadingMatch ? plainHeadingMatch[1].trim() : "";
}

function collectLinesUntil(lines, startIndex, isEndLine) {
  const collected = [];

  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (isEndLine(line)) {
      break;
    }
    collected.push(line);
  }

  return collected;
}

function extractGeneralNotesMarkdown(lines) {
  const startIndex = lines.findIndex(
    line => line.trim() === "## General notes"
  );
  if (startIndex === -1) {
    return [];
  }

  return collectLinesUntil(
    lines,
    startIndex + 1,
    line => /^##\s+/u.test(line)
  );
}

function extractModuleSectionMarkdown(lines, moduleSlug) {
  const startIndex = lines.findIndex((line) => {
    if (!line.startsWith("### ")) {
      return false;
    }

    const headingText = parseModuleHeadingText(line);
    return normalizeModuleSlug(headingText) === moduleSlug;
  });

  if (startIndex === -1) {
    return null;
  }

  const relativeEndIndex = lines
    .slice(startIndex + 1)
    .findIndex(line => line.startsWith("### "));
  let endIndex = lines.length;
  if (relativeEndIndex !== -1) {
    endIndex = startIndex + 1 + relativeEndIndex;
  }

  return {
    bodyLines: lines.slice(startIndex + 1, endIndex),
    headingLine: lines[startIndex],
    title: parseModuleHeadingText(lines[startIndex])
  };
}

function extractIssueSections(lines) {
  const modulesWithIssuesIndex = lines.findIndex(
    line => line.trim() === "## Modules with issues"
  );
  if (modulesWithIssuesIndex === -1) {
    return [];
  }

  const moduleSections = [];

  for (
    let lineIndex = modulesWithIssuesIndex + 1;
    lineIndex < lines.length;
    lineIndex += 1
  ) {
    const line = lines[lineIndex];
    if (line.startsWith("### ")) {
      const relativeEndIndex = lines
        .slice(lineIndex + 1)
        .findIndex(candidate => candidate.startsWith("### "));
      const endIndex = relativeEndIndex === -1
        ? lines.length
        : lineIndex + 1 + relativeEndIndex;

      moduleSections.push({
        bodyLines: lines.slice(lineIndex + 1, endIndex),
        headingLine: lines[lineIndex],
        title: parseModuleHeadingText(lines[lineIndex])
      });

      lineIndex = endIndex - 1;
    }
  }

  return moduleSections;
}

function buildResultsMarkdown(markdownText, outdatedModulesBySlug, showOutdated) {
  if (showOutdated) {
    return markdownText;
  }

  const lines = markdownText.split("\n");
  const modulesWithIssuesIndex = lines.findIndex(
    line => line.trim() === "## Modules with issues"
  );
  if (modulesWithIssuesIndex === -1) {
    return markdownText;
  }

  const preservedLines = lines.slice(0, modulesWithIssuesIndex + 1);
  const visibleSections = extractIssueSections(lines).filter((section) => {
    const moduleSlug = normalizeModuleSlug(section.title);
    return !outdatedModulesBySlug.has(moduleSlug);
  });

  if (visibleSections.length > 0) {
    preservedLines.push("");
  }

  visibleSections.forEach((section, index) => {
    if (index > 0) {
      preservedLines.push("");
    }

    preservedLines.push(section.headingLine, "", ...section.bodyLines);
  });

  return preservedLines.join("\n").trim();
}

function buildOutdatedModulesSet(modulesData) {
  const modules = Array.isArray(modulesData?.modules)
    ? modulesData.modules
    : [];

  return new Set(
    modules
      .filter(moduleData => Boolean(moduleData?.outdated))
      .map((moduleData) => {
        const maintainer = typeof moduleData.maintainer === "string"
          ? moduleData.maintainer
          : "";
        return normalizeModuleSlug(`${moduleData.name}-by-${maintainer}`);
      })
  );
}

function buildFilteredModuleMarkdown(markdownText, moduleSlug) {
  const lines = markdownText.split("\n");
  const moduleSection = extractModuleSectionMarkdown(lines, moduleSlug);
  if (!moduleSection) {
    return null;
  }

  const generalNotes = extractGeneralNotesMarkdown(lines);
  const moduleHeadingLine = moduleSection.headingLine.replace(/^###\s+/u, "## ");
  const outputLines = [];

  if (generalNotes.length > 0) {
    outputLines.push("### General notes", "", ...generalNotes, "");
  }

  outputLines.push(moduleHeadingLine, "");
  outputLines.push("### Findings", "", ...moduleSection.bodyLines);

  return {
    markdown: outputLines.join("\n").trim(),
    title: moduleSection.title
  };
}

function setPageTitle(title) {
  document.title = `${title} · Module hints`;
}

function setFullHintsListLink(fullResultsLink) {
  fullResultsLink.href = "result.html";
  fullResultsLink.textContent = "Full hints list";
}

async function fetchOutdatedModulesSet() {
  const response = await fetch("data/modules.json");
  if (!response.ok) {
    throw new Error(`Error fetching modules metadata: ${response.statusText}`);
  }

  const modulesData = await response.json();
  return buildOutdatedModulesSet(modulesData);
}

async function loadAndDisplayMarkdown() {
  const markdownContainer = document.getElementById("markdown-container");
  const markdownFile = "result.md";
  const moduleSlug = new URLSearchParams(window.location.search).get(
    "module"
  );
  const fullResultsLink = document.getElementById("full-results-link");
  const outdatedFilter = document.getElementById("show-outdated-findings");

  if (moduleSlug) {
    outdatedFilter.closest("#page-filters")?.remove();
  }
  else {
    fullResultsLink.remove();
  }

  try {
    const [markdownResponse, outdatedModulesBySlug] = await Promise.all([
      fetch(markdownFile),
      moduleSlug ? Promise.resolve(new Set()) : fetchOutdatedModulesSet()
    ]);
    if (!markdownResponse.ok) {
      throw new Error(
        `Error fetching the markdown file: ${markdownResponse.statusText}`
      );
    }
    const markdownText = await markdownResponse.text();

    if (moduleSlug) {
      const filtered = buildFilteredModuleMarkdown(
        markdownText,
        moduleSlug
      );
      if (filtered) {
        markdownContainer.innerHTML = sanitizeMarkdownHtml(filtered.markdown);
        setPageTitle(filtered.title);
        setFullHintsListLink(fullResultsLink);
      }
      else {
        markdownContainer.innerHTML
          = "<p>No hints found for this module.</p>";
        setPageTitle("Module hints");
        setFullHintsListLink(fullResultsLink);
      }
    }
    else {
      const renderMarkdown = () => {
        const filteredMarkdown = buildResultsMarkdown(
          markdownText,
          outdatedModulesBySlug,
          outdatedFilter.checked
        );
        markdownContainer.innerHTML = sanitizeMarkdownHtml(filteredMarkdown);
        addHeadingAnchors();
      };

      outdatedFilter.addEventListener("change", renderMarkdown);
      renderMarkdown();
      return;
    }

    addHeadingAnchors();
  }
  catch (error) {
    console.error("Error loading markdown:", error);
    markdownContainer.innerHTML
      = "<p>Error loading markdown content.</p>";
  }
}

function addHeadingAnchors() {
  const markdownContainer = document.getElementById("markdown-container");
  const headings = markdownContainer.querySelectorAll("h1, h2, h3, h4");
  headings.forEach((heading) => {
    const anchorId = normalizeModuleSlug(heading.textContent);
    const anchor = document.createElement("a");
    anchor.id = anchorId;
    anchor.href = `#${anchorId}`;
    anchor.classList.add("heading-anchor");
    anchor.textContent = "#";
    heading.appendChild(anchor);
  });

  const hash = window.location.hash;
  if (hash) {
    const decodedHash = decodeURIComponent(hash);
    const targetId = decodedHash.startsWith("#")
      ? decodedHash.slice(1)
      : decodedHash;
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView();
    }
  }
}

loadAndDisplayMarkdown();

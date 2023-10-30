const fs = require("fs");

async function fetchMarkdownData() {
  try {
    const url =
      "https://raw.githubusercontent.com/wiki/MichMich/MagicMirror/3rd-Party-Modules.md";
    const response = await fetch(url);
    if (response.status !== 200) {
      throw new Error(
        `The fetch() call failed. Status code: ${response.status}`
      );
    }
    const markdown = await response.text();
    return markdown;
  } catch (error) {
    console.error(error);
  }
}

function sortByNameIgnoringPrefix(a, b) {
  const nameA = a.name.replace("MMM-", "");
  const nameB = b.name.replace("MMM-", "");
  return nameA.localeCompare(nameB);
}

async function createModuleList() {
  const markdown = await fetchMarkdownData();
  const moduleList = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const line of markdown.split("\n")) {
    if (
      line.includes("](https://github.com/") ||
      line.includes("](https://gitlab.com/")
    ) {
      // Split the line into an array of parts, and trim each part.
      const parts = line.split("|").map((part) => {
        return part.trim();
      });

      if (parts.length === 5) {
        const issues = [];

        const url = parts[1].match(/\[(.*?)\]\((.*?)\)/)[2].trim();
        if (
          !url.startsWith("https://github.com") &&
          !url.startsWith("https://gitlab.com")
        ) {
          issues.push(
            `URL: Neither a valid GitHub nor a valid GitLab URL: ${url}.`
          );
        }

        const id = url
          .replace("https://github.com/", "")
          .replace("https://gitlab.com/", "");

        const maintainer = url.split("/")[3];
        const name = url.split("/")[4];

        const maintainerLinked = parts[2].match(/\[(.*?)\]\((.*?)\)/);
        let maintainerURL;
        if (maintainerLinked !== null) {
          maintainerURL = maintainerLinked[2];
        } else {
          maintainerURL = "";
        }

        const description = parts[3];

        const module = {
          name,
          url,
          id,
          maintainer,
          maintainerURL,
          description,
          issues
        };
        moduleList.push(module);
      }
    }
  }

  const sortedModuleList = moduleList.sort(sortByNameIgnoringPrefix);

  fs.writeFileSync(
    "./docs/modules.temp.json",
    JSON.stringify(sortedModuleList, null, 2),
    "utf8"
  );
}

createModuleList();

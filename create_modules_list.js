const fs = require("fs");
const fsp = require("fs").promises;

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

async function getModuleData(maintainer, name) {
  console.log(`##### ${name} ${maintainer}`);

  const data = await fsp.readFile(
    `./modules/${name}-----${maintainer}/package.json`,
    "utf8"
  );
  const json = JSON.parse(data);
  return json;
}

async function createModuleList() {
  const markdown = await fetchMarkdownData();
  const modules = [];
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
        let maintainer;
        let maintainerURL;

        const name = parts[1].match(/\[(.*?)\]\((.*?)\)/)[1];
        const url = parts[1].match(/\[(.*?)\]\((.*?)\)/)[2];
        if (
          !url.startsWith("https://github.com") &&
          !url.startsWith("https://gitlab.com")
        ) {
          issues.push(
            `URL: Neither a valid GitHub nor a valid GitLab URL. ${url}`
          );
        }

        const id = url
          .replace("https://github.com/", "")
          .replace("https://gitlab.com/", "");

        const maintainerLinked = parts[2].match(/\[(.*?)\]\((.*?)\)/);
        if (maintainerLinked !== null) {
          maintainer = maintainerLinked[1];
          maintainerURL = maintainerLinked[2];
        } else {
          maintainer = parts[2];
          maintainerURL = "";
        }

        const description = parts[3];

        let tags = [];
        let license;

        // Gather Information from package.json
        try {
          // eslint-disable-next-line no-await-in-loop
          const moduleData = await getModuleData(maintainer, name);
          if (moduleData.keywords) {
            tags = moduleData.keywords.map((tag) => tag.toLowerCase());
          }
          license = moduleData.license;
        } catch (error) {
          if (error instanceof SyntaxError) {
            issues.push("- E - An error occurred parsing 'package.json'.");
          } else if (error.code === "ENOENT") {
            issues.push(
              "- W - There is no 'package.json'. We need this file to gather information about the module."
            );
          } else {
            issues.push(
              `- E - An error occurred while getting information from 'package.json': ${error}`
            );
          }
        }

        const module = {
          name,
          url,
          id,
          maintainer,
          maintainerURL,
          description,
          tags,
          license,
          issues
        };
        modules.push(module);
      }
    }
  }

  fs.writeFileSync("modules.json", JSON.stringify(modules, null, 2), "utf8");
}

createModuleList();

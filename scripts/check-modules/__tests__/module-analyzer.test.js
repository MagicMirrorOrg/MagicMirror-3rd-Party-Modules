import * as fsPromises from "node:fs/promises";
import { analyzeModule } from "../../check-modules/module-analyzer.ts";
import { strict as assert } from "node:assert";
import { formatIssues } from "../issue.ts";
import { join } from "node:path";
import { runEslintCheck } from "../eslint-check.ts";
import { test } from "node:test";
import { tmpdir } from "node:os";

test("worker ESLint reports HTTP imports once and ignores README mentions", async (context) => {
  const moduleRoot = await createTempModule();
  context.after(() => fsPromises.rm(moduleRoot, { recursive: true, force: true }));
  const codePath = join(moduleRoot, "node_helper.js");
  const readmePath = join(moduleRoot, "README.md");
  await fsPromises.writeFile(codePath, "const client = require('axios');\n");
  await fsPromises.appendFile(readmePath, "\nUse axios or 'node-fetch' or require('request').\n");

  const issues = formatIssues(await runEslintCheck(moduleRoot, false));
  const httpIssues = issues.filter(issue => issue.includes("built-in fetch"));
  assert.equal(httpIssues.length, 1);
  assert.match(httpIssues[0], /node_helper\.js:1:\d+/u);
});

async function createTempModule() {
  const root = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-test-"));
  await fsPromises.mkdir(join(root, ".github"), { recursive: true });

  await fsPromises.writeFile(
    join(root, "README.md"),
    [
      "# MMM-Remote-Control",
      "",
      "## Installation",
      "git clone https://github.com/Jopyth/MMM-Remote-Control",
      "",
      "## Update",
      "Update steps",
      "",
      "## Config",
      "```javascript",
      "{",
      "  module: \"MMM-Remote-Control\",",
      "  config: {",
      "    credentials: {",
      "      clientId: \"\"",
      "    },",
      "    foo: true",
      "  }",
      "},",
      "```",
      ""
    ].join("\n")
  );

  await fsPromises.writeFile(
    join(root, "CHANGELOG.md"),
    "XMLHttpRequest\nnpm run\ngit checkout\n"
  );
  await fsPromises.writeFile(join(root, "CODE_OF_CONDUCT.md"), "code of conduct");
  await fsPromises.writeFile(join(root, "LICENSE.md"), "license");
  await fsPromises.writeFile(join(root, "eslint.config.mjs"), "export default [];\n");
  await fsPromises.writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        devDependencies: { eslint: "^10.0.0" },
        scripts: { lint: "eslint" }
      },
      null,
      2
    )
  );
  await fsPromises.writeFile(
    join(root, "package-lock.json"),
    `${JSON.stringify(
      {
        name: "x",
        note: "jshint",
        lockfileVersion: 2,
        scripts: { test: "node --run lint" }
      },
      null,
      2
    )}\n`
  );
  await fsPromises.writeFile(join(root, ".github", "dependabot.yaml"), "version: 2\nupdates: []\n");

  return root;
}

test("analyzer keeps .github files and applies only lockfile-specific package-lock rules", async () => {
  const moduleRoot = await createTempModule();
  const files = [
    join(moduleRoot, "README.md"),
    join(moduleRoot, "CHANGELOG.md"),
    join(moduleRoot, "CODE_OF_CONDUCT.md"),
    join(moduleRoot, "LICENSE.md"),
    join(moduleRoot, "eslint.config.mjs"),
    join(moduleRoot, "package.json"),
    join(moduleRoot, "package-lock.json"),
    join(moduleRoot, ".github", "dependabot.yaml")
  ];

  const result = await analyzeModule(
    moduleRoot,
    "MMM-Remote-Control",
    "https://github.com/Jopyth/MMM-Remote-Control",
    files
  );

  const issues = formatIssues(result.issues);
  assert.equal(
    issues.some(issue => issue.includes("There is no dependabot configuration file")),
    false
  );
  assert.equal(
    issues.some(issue => issue.includes("in file `CHANGELOG.md`")),
    false
  );
  assert.equal(
    issues.some(
      issue => issue.includes("Found `jshint`") && issue.includes("in file `package-lock.json`")
    ),
    false
  );
  assert.equal(
    issues.some(
      issue => issue.includes("Found `\"lockfileVersion\": 2`") && issue.includes("in file `package-lock.json`")
    ),
    true
  );

  assert.ok(Array.isArray(result.issues));
});

test("analyzer accepts valid git clone commands with flags", async () => {
  const moduleRoot = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-clone-flags-test-"));

  await fsPromises.writeFile(
    join(moduleRoot, "README.md"),
    [
      "# MMM-Clone-Flags-Test",
      "",
      "## Installation",
      "git clone --depth=1 https://github.com/example/MMM-Clone-Flags-Test",
      "git clone --recurse-submodules https://github.com/example/MMM-Clone-Flags-Test",
      "git clone -b main https://github.com/example/MMM-Clone-Flags-Test",
      "",
      "## Update",
      "Update steps",
      "",
      "## Config",
      "```javascript",
      "{",
      "  module: \"MMM-Clone-Flags-Test\"",
      "}",
      "```"
    ].join("\n")
  );
  await fsPromises.writeFile(join(moduleRoot, "CHANGELOG.md"), "changelog\n");
  await fsPromises.writeFile(join(moduleRoot, "CODE_OF_CONDUCT.md"), "code of conduct\n");
  await fsPromises.writeFile(join(moduleRoot, "LICENSE.md"), "MIT\n");
  await fsPromises.writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify({
      name: "mmm-clone-flags-test",
      version: "1.0.0"
    })
  );

  const files = [
    join(moduleRoot, "README.md"),
    join(moduleRoot, "CHANGELOG.md"),
    join(moduleRoot, "CODE_OF_CONDUCT.md"),
    join(moduleRoot, "LICENSE.md"),
    join(moduleRoot, "package.json")
  ];

  const result = await analyzeModule(
    moduleRoot,
    "MMM-Clone-Flags-Test",
    "https://github.com/example/MMM-Clone-Flags-Test",
    files
  );

  assert.equal(formatIssues(result.issues).some(issue => issue.includes("incorrect clone instructions")), false);
});

test("analyzer applies classic-module exceptions for mmpm", async () => {
  const moduleRoot = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-mmpm-test-"));

  await fsPromises.writeFile(join(moduleRoot, "README.md"), "# mmpm\n");
  await fsPromises.writeFile(join(moduleRoot, "LICENSE.md"), "MIT\n");
  await fsPromises.writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify({
      name: "mmpm",
      version: "1.0.0"
    })
  );

  const files = [
    join(moduleRoot, "README.md"),
    join(moduleRoot, "LICENSE.md"),
    join(moduleRoot, "package.json")
  ];

  const result = await analyzeModule(
    moduleRoot,
    "mmpm",
    "https://github.com/Bee-Mar/mmpm",
    files
  );

  const issues = formatIssues(result.issues);
  assert.equal(issues.some(issue => issue.includes("README seems not to have an update section")), false);
  assert.equal(issues.some(issue => issue.includes("There is no CODE_OF_CONDUCT file")), true);
  assert.equal(issues.some(issue => issue.includes("There is no dependabot configuration file")), false);
  assert.equal(issues.some(issue => issue.includes("No linter configuration was found")), false);
});

test("analyzer accepts biome config as linting setup", async () => {
  const moduleRoot = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-biome-test-"));

  await fsPromises.writeFile(join(moduleRoot, "README.md"), "# MMM-Biome-Test\n");
  await fsPromises.writeFile(join(moduleRoot, "CHANGELOG.md"), "changelog\n");
  await fsPromises.writeFile(join(moduleRoot, "CODE_OF_CONDUCT.md"), "code of conduct\n");
  await fsPromises.writeFile(join(moduleRoot, "LICENSE.md"), "MIT\n");
  await fsPromises.writeFile(join(moduleRoot, "biome.jsonc"), "{\n  \"linter\": { \"enabled\": true }\n}\n");
  await fsPromises.writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify({
      name: "mmm-biome-test",
      version: "1.0.0"
    })
  );

  const files = [
    join(moduleRoot, "README.md"),
    join(moduleRoot, "CHANGELOG.md"),
    join(moduleRoot, "CODE_OF_CONDUCT.md"),
    join(moduleRoot, "LICENSE.md"),
    join(moduleRoot, "biome.jsonc"),
    join(moduleRoot, "package.json")
  ];

  const result = await analyzeModule(
    moduleRoot,
    "MMM-Biome-Test",
    "https://github.com/example/MMM-Biome-Test",
    files
  );

  const issues = formatIssues(result.issues);
  assert.equal(issues.some(issue => issue.includes("No linter configuration was found")), false);
  assert.equal(issues.some(issue => issue.includes("ESLint is not in the dependencies or devDependencies")), false);
  assert.equal(issues.some(issue => issue.includes("lint script in package.json does not contain `eslint`")), false);
});

test("analyzer flags likely core-provided moment usage per module", async () => {
  const moduleRoot = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-moment-core-test-"));
  const frontendPath = join(moduleRoot, "MMM-Moment.js");

  await fsPromises.writeFile(
    frontendPath,
    "Module.register('MMM-Moment', { start () { this.value = moment().format('HH:mm'); } });\n"
  );

  const result = await analyzeModule(
    moduleRoot,
    "MMM-Moment",
    "https://github.com/example/MMM-Moment",
    [frontendPath]
  );

  const momentIssue = formatIssues(result.issues).find(issue => issue.includes("likely relies on core-provided Moment"));

  assert.equal(
    Boolean(momentIssue),
    true
  );
  assert.equal(Boolean(momentIssue?.includes("`MMM-Moment.js`")), true);
});

test("analyzer does not flag moment core reliance when module imports moment", async () => {
  const moduleRoot = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-moment-import-test-"));
  const helperPath = join(moduleRoot, "node_helper.js");

  await fsPromises.writeFile(
    helperPath,
    "const moment = require('moment');\nmodule.exports = { value: moment().format('HH:mm') };\n"
  );

  const result = await analyzeModule(
    moduleRoot,
    "MMM-Moment-Import",
    "https://github.com/example/MMM-Moment-Import",
    [helperPath]
  );

  assert.equal(
    formatIssues(result.issues).some(issue => issue.includes("likely relies on core-provided Moment")),
    false
  );
});

test("analyzer ignores plain-text moment mentions in comments", async () => {
  const moduleRoot = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-moment-comment-test-"));
  const frontendPath = join(moduleRoot, "MMM-CommentOnly.js");

  await fsPromises.writeFile(
    frontendPath,
    "//#timezone // reserved for later usage... but I have no idea at this moment.\n"
  );

  const result = await analyzeModule(
    moduleRoot,
    "MMM-CommentOnly",
    "https://github.com/example/MMM-CommentOnly",
    [frontendPath]
  );

  assert.equal(
    formatIssues(result.issues).some(issue => issue.includes("likely relies on core-provided Moment")),
    false
  );
});

test("analyzer skips binary files in text checks while retaining SVG and size checks", async (context) => {
  const moduleRoot = await createTempModule();
  context.after(() => fsPromises.rm(moduleRoot, { recursive: true, force: true }));
  const imagePath = join(moduleRoot, "image.JPG");
  const videoPath = join(moduleRoot, "video.mp4");
  const archivePath = join(moduleRoot, "archive.zip");
  const svgPath = join(moduleRoot, "image.svg");

  await Promise.all([imagePath, videoPath, archivePath, svgPath].map(file => fsPromises.writeFile(file, "Magic Mirror")));
  await fsPromises.truncate(archivePath, 11 * 1024 * 1024);
  const result = await analyzeModule(moduleRoot, "MMM-Test", "https://github.com/example/MMM-Test", [imagePath, videoPath, archivePath, svgPath]);
  const issues = formatIssues(result.issues);
  assert.equal(issues.some(issue => issue.includes("in file `image.svg`") && issue.includes("Magic Mirror")), true);
  for (const filename of ["image.JPG", "video.mp4", "archive.zip"]) {
    assert.equal(issues.some(issue => issue.includes(`in file \`${filename}\``) && issue.includes("Magic Mirror")), false);
  }
  assert.equal(issues.some(issue => issue.includes("archive.zip") && issue.includes("unusually large")), true);
});

test("analyzer reports large non-media repositories but excludes images", async () => {
  const moduleRoot = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-size-test-"));
  const sourcePath = join(moduleRoot, "large-source.js");
  const imagePath = join(moduleRoot, "large-image.png");
  const videoPath = join(moduleRoot, "large-video.mp4");

  await fsPromises.writeFile(sourcePath, new Uint8Array(11 * 1024 * 1024));
  await fsPromises.writeFile(imagePath, new Uint8Array(30 * 1024 * 1024));
  await fsPromises.writeFile(videoPath, new Uint8Array(30 * 1024 * 1024));

  const result = await analyzeModule(
    moduleRoot,
    "MMM-Size-Test",
    "https://github.com/example/MMM-Size-Test",
    [sourcePath, imagePath, videoPath]
  );

  assert.equal(
    formatIssues(result.issues).some(issue => issue.includes("large-source.js") && issue.includes("unusually large")),
    true
  );
  assert.equal(
    formatIssues(result.issues).some(issue => issue.includes("large-image.png")),
    false
  );
  assert.equal(
    formatIssues(result.issues).some(issue => issue.includes("large-video.mp4")),
    false
  );
  assert.equal(
    formatIssues(result.issues).some(issue => issue.includes("repository contains") && issue.includes("Warning")),
    false
  );
});

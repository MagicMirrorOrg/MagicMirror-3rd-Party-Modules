import { createIssue, type Issue } from "../check-modules/issue.ts";
import { getRepositoryStatusIssues } from "../check-modules/repository-status-check.ts";
import { createDeterministicImageName } from "../shared/deterministic-output.ts";
import fs from "node:fs";
import normalizeData from "normalize-package-data";
import path from "node:path";
import sharp from "sharp";
import type {
  EnrichResult,
  FindImageResult,
  ModuleInput,
  PackageJsonInfo,
  PackageSummary,
  ProcessModuleConfig
} from "./module-types.ts";

const COMPATIBLE_LICENSES = new Set([
  "AGPL-3.0",
  "AGPL-3.0-or-later",
  "Apache-2.0",
  "BSD-3-Clause",
  "CC0-1.0",
  "GPL-2.0",
  "GPL-3.0",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "ISC",
  "MIT",
  "MIT-Modern-Variant",
  "MPL-2.0",
  "LGPL-2.1",
  "LGPL-2.1-only",
  "Unlicense"
]);

function isImageFile(filename: string): boolean {
  return (/\.(bmp|gif|jpg|jpeg|png|webp)$/iu).test(filename);
}

async function findAndResizeImage(moduleName: string, moduleMaintainer: string, config: ProcessModuleConfig): Promise<FindImageResult> {
  const sourceFolder = path.join(config.modulesDir, `${moduleName}-----${moduleMaintainer}`);

  try {
    const files = await fs.promises.readdir(sourceFolder, { recursive: true });
    files.sort();
    const issues: Issue[] = [];
    let firstScreenshotImage: string | null = null;
    let firstImage: string | null = null;

    for (const file of files) {
      if (!isImageFile(file)) {
        continue;
      }
      const lowerFile = file.toLowerCase();
      if (["screenshot", "example", "sample", "preview"].some(marker => lowerFile.includes(marker))) {
        firstScreenshotImage = file;
        break;
      }
      firstImage ??= file;
    }

    const imageToProcess = firstScreenshotImage ?? firstImage;
    if (!imageToProcess) {
      issues.push(createIssue(undefined, "No image found."));
      return { targetImageName: null, issues };
    }

    const targetImageName = createDeterministicImageName(moduleName, moduleMaintainer, "webp");
    try {
      await sharp(path.join(sourceFolder, imageToProcess))
        .resize(500, 600, { fit: sharp.fit.inside, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(path.join(config.imagesDir, targetImageName));
      return { targetImageName, issues };
    }
    catch (error) {
      issues.push(createIssue(undefined, `Error processing image "${imageToProcess}": ${error instanceof Error ? error.message : String(error)}`, { severity: "error" }));
      return { targetImageName: null, issues };
    }
  }
  catch (error) {
    return {
      targetImageName: null,
      issues: [createIssue(undefined, `Error reading module directory for images: ${error instanceof Error ? error.message : String(error)}`, { severity: "error" })]
    };
  }
}

function sanitizeStringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value).filter(([, entry]) => typeof entry === "string" && entry.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function sanitizeKeywordArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const keywords = value
    .map(entry => typeof entry === "string" ? entry.trim() : "")
    .filter(entry => entry.length > 0);
  return keywords.length > 0 ? keywords : null;
}

function buildPackageSummary(packageData: Record<string, unknown>): PackageSummary {
  const summary: PackageSummary = {};
  for (const key of ["name", "version", "description", "license", "type"] as const) {
    if (typeof packageData[key] === "string" && packageData[key].length > 0) {
      summary[key] = packageData[key];
    }
  }
  const keywords = sanitizeKeywordArray(packageData.keywords);
  if (keywords) {
    summary.keywords = keywords;
  }
  for (const key of ["scripts", "dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "engines"] as const) {
    const record = sanitizeStringRecord(packageData[key]);
    if (record) {
      summary[key] = record;
    }
  }
  return summary;
}

async function loadPackageManifest(module: ModuleInput, config: ProcessModuleConfig): Promise<PackageJsonInfo> {
  const packagePath = path.join(config.modulesDir, `${module.name}-----${module.maintainer}`, "package.json");
  let raw: string;

  try {
    raw = await fs.promises.readFile(packagePath, "utf8");
  }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { path: packagePath, status: "missing", warnings: [] };
    }
    return { path: packagePath, status: "error", warnings: [], error: error instanceof Error ? error.message : String(error) };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  }
  catch (error) {
    return { path: packagePath, status: "error", warnings: [], error: error instanceof Error ? error.message : String(error) };
  }

  const warnings: string[] = [];
  try {
    normalizeData(parsed, (message: string) => {
      if (!message.includes("No README data")) {
        warnings.push(message);
      }
    });
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  }

  return { path: packagePath, status: "parsed", summary: buildPackageSummary(parsed), warnings };
}

function deriveTagsFromKeywords(keywords: string[], issues: Issue[]): string[] | null {
  const ignoredTags = new Set([
    "2", "mm", "mm2", "magic", "magicmirror", "magicmirror2", "magicmirror²",
    "magic mirror", "magic mirror 2", "magic-mirror", "magic mirror module",
    "magicmirror-module", "mirror", "mmm", "module", "nodejs", "smart", "smart mirror"
  ]);
  const duplicates = keywords.filter((tag, index) => keywords.indexOf(tag) !== index);
  if (duplicates.length > 0) {
    issues.push(createIssue(undefined, `There are duplicates in the keywords in your package.json: ${duplicates.join(", ")}`));
  }

  let processed = keywords
    .map((tag) => {
      const lowered = tag.toLowerCase();
      if (lowered === "smarthome") {
        issues.push(createIssue(undefined, "Please use 'smart home' instead of 'smarthome' as a keyword in your package.json."));
        return "smart home";
      }
      return lowered === "sport" ? "sports" : lowered;
    })
    .filter(tag => !ignoredTags.has(tag));

  if (processed.some(tag => ["image", "images", "pictures", "livestream", "photos", "video"].includes(tag))) {
    processed.push("media");
  }
  processed = [...new Set(processed)];

  if (processed.length === 0) {
    issues.push(createIssue(undefined, "There are no specific keywords in 'package.json'. We would use them as tags on the module list page. Add a few meaningful terms to the keywords in the package.json. Not just \"magicmirror\" or \"module\"."));
    return null;
  }
  return processed;
}

export async function enrichModule(module: ModuleInput, config: ProcessModuleConfig): Promise<EnrichResult> {
  const enrichIssues: Issue[] = [];
  if (config.moduleLogger) {
    await config.moduleLogger.info("enrich", "Starting enrichment stage");
  }

  const packageJson = await loadPackageManifest(module, config);
  if (config.moduleLogger) {
    await config.moduleLogger.info("enrich", "Loaded package.json", {
      status: packageJson.status,
      hasKeywords: (packageJson.summary?.keywords?.length ?? 0) > 0
    });
  }

  let tags: string[] | undefined;
  let imageName: string | undefined;
  let effectiveLicense = module.license;
  let licenseStatus: "mismatch" | undefined;

  if (packageJson.status === "parsed") {
    for (const warning of packageJson.warnings ?? []) {
      enrichIssues.push(createIssue(undefined, `\`package.json\` issue: ${warning}`));
    }
    const summaryKeywords = packageJson.summary?.keywords ?? [];
    if (summaryKeywords.length > 0) {
      const derivedTags = deriveTagsFromKeywords(summaryKeywords, enrichIssues);
      if (derivedTags && derivedTags.length > 0) {
        tags = derivedTags;
        if (config.moduleLogger) {
          await config.moduleLogger.info("enrich", "Derived tags from keywords", { tags: derivedTags });
        }
      }
    }
    else {
      enrichIssues.push(createIssue(undefined, "There are no keywords in 'package.json'. We would use them as tags on the module list page."));
    }

    const packageLicense = packageJson.summary?.license;
    if (packageLicense && packageLicense !== "NOASSERTION") {
      if (!module.license) {
        effectiveLicense = packageLicense;
      }
      else if (!packageLicense.includes(module.license)) {
        enrichIssues.push(createIssue(undefined, `Issue: The license in the package.json (${packageLicense}) doesn't match the license file (${module.license}).`));
        effectiveLicense = undefined;
        licenseStatus = "mismatch";
      }
    }
  }
  else if (packageJson.status === "missing") {
    if (module.name === "mmpm") {
      tags = ["package manager", "module installer"];
    }
    else {
      enrichIssues.push(createIssue(undefined, "There is no `package.json`. We need this file to gather information about the module for the module list page."));
    }
  }
  else {
    enrichIssues.push(createIssue(undefined, `An error occurred while getting information from 'package.json': ${packageJson.error}`, { severity: "error" }));
  }

  enrichIssues.push(...getRepositoryStatusIssues(module));

  if (effectiveLicense && COMPATIBLE_LICENSES.has(effectiveLicense)) {
    if (config.moduleLogger) {
      await config.moduleLogger.info("enrich", "Processing image", { license: effectiveLicense });
    }
    const { targetImageName, issues: imageIssues } = await findAndResizeImage(module.name, module.maintainer, config);
    if (targetImageName) {
      imageName = targetImageName;
      if (config.moduleLogger) {
        await config.moduleLogger.info("enrich", "Image processed successfully", { imageName: targetImageName });
      }
    }
    enrichIssues.push(...imageIssues);
  }
  else if (effectiveLicense) {
    enrichIssues.push(createIssue(undefined, "No compatible or wrong license field in 'package.json' or LICENSE file. Without that, we can't use an image."));
    if (config.moduleLogger) {
      await config.moduleLogger.warn("enrich", "Incompatible license - skipping image", { license: effectiveLicense });
    }
  }

  if (config.moduleLogger) {
    await config.moduleLogger.info("enrich", "Enrichment complete", {
      tagsCount: tags?.length ?? 0,
      hasImage: Boolean(imageName),
      issuesCount: enrichIssues.length
    });
  }

  return { packageJson, tags, image: imageName, license: effectiveLicense, licenseStatus, enrichIssues };
}

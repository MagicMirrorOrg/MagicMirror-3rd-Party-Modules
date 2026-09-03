import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(
  projectRoot,
  "node_modules",
  "dompurify",
  "dist",
  "purify.es.mjs"
);
const destination = join(
  projectRoot,
  "website",
  "vendor",
  "dompurify.mjs"
);

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);

import { readFile, writeFile } from "node:fs/promises";
import { RULE_REGISTRY } from "./rule-registry.ts";
import { format } from "prettier";

const documentation = new URL("../../docs/pipeline/check-modules-reference.md", import.meta.url);
const start = "<!-- rule-inventory:start -->";
const end = "<!-- rule-inventory:end -->";

function escapeCell(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("|", "\\|").replaceAll("\n", " ");
}

export async function updateRuleInventory(markdown) {
  const sections = markdown.split(start);
  if (sections.length !== 2) {
    throw new Error("Expected exactly one rule inventory start marker");
  }
  const remainder = sections[1].split(end);
  if (remainder.length !== 2) {
    throw new Error("Expected exactly one rule inventory end marker");
  }
  const rows = RULE_REGISTRY.map((rule) => {
    const patterns = rule.patterns.map(pattern => `<code>${escapeCell(pattern).replaceAll("`", "&#96;").replaceAll("[", "&#91;").replaceAll("]", "&#93;")}</code>`).join(" / ");
    return `| \`${escapeCell(rule.id)}\` | ${escapeCell(rule.scope)} | ${patterns} | ${escapeCell(rule.category)} | ${escapeCell(rule.description)} |`;
  });
  const table = await format(["| Rule ID | Scope | Patterns | Category | Description |", "| --- | --- | --- | --- | --- |", ...rows].join("\n"), { parser: "markdown" });
  return `${sections[0]}${start}\n\n${table}\n${end}${remainder[1]}`;
}

if (import.meta.main) {
  const markdown = await readFile(documentation, "utf8");
  await writeFile(documentation, await updateRuleInventory(markdown));
}

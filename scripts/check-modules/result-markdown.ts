import { createIssue, formatIssue, normalizeIssues, type Issue } from "./issue.ts";

export interface ResultMarkdownStats {
  issueCounter: number;
  lastUpdate: string;
  maintainer: Record<string, number>;
  moduleCounter: number;
  modulesWithIssuesCounter: number;
  repositoryHoster: Record<string, number>;
}

export interface IssueSummary {
  issues: Issue[];
  maintainer: string;
  name: string;
  url?: string;
}

interface ProcessedModuleLike {
  issues?: unknown;
  maintainer?: string;
  name?: string;
  outdated?: string;
  watchersCount?: number;
  url?: string;
}

function isGitHubUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.length === 0) {
    return false;
  }

  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "github.com" || host === "www.github.com";
  }
  catch {
    return false;
  }
}

export function normalizeIssuesInput(issues: unknown): Issue[] {
  return normalizeIssues(issues);
}

export function collectIssueSummaries(modules: unknown[]): IssueSummary[] {
  return modules.flatMap((module): IssueSummary[] => {
    if (!module || typeof module !== "object") {
      return [];
    }

    const stageModule = module as ProcessedModuleLike;
    if (stageModule.outdated) {
      return [];
    }

    const issues = normalizeIssuesInput(stageModule.issues);
    const watcherIssue = isGitHubUrl(stageModule.url) && stageModule.watchersCount === 0
      ? createIssue(undefined, "GitHub reports 0 subscribers (Watch); maintainer notifications may be missed.")
      : null;

    const combinedIssues = watcherIssue ? [...issues, watcherIssue] : issues;

    if (combinedIssues.length === 0 || typeof stageModule.name !== "string" || typeof stageModule.maintainer !== "string") {
      return [];
    }

    return [{
      issues: combinedIssues,
      maintainer: stageModule.maintainer,
      name: stageModule.name,
      url: typeof stageModule.url === "string" ? stageModule.url : undefined
    }];
  });
}

export function buildResultMarkdown(stats: ResultMarkdownStats, summaries: IssueSummary[]): string {
  const lines: string[] = [];
  lines.push("# Result of the module analysis", "");
  lines.push(`Last update: ${stats.lastUpdate}`, "");
  lines.push("## General notes", "");
  lines.push(
    "* This is an automated analysis of the modules. It is not perfect and can contain errors. If you have any questions or suggestions, please open an issue on GitHub."
  );
  lines.push(
    "* Some issues are opinionated recommendations. Please feel free to ignore them.",
    ""
  );

  lines.push("## Statistics", "");
  lines.push("|                      | number   |");
  lines.push("|:---------------------|:--------:|");
  lines.push(
    `| modules analyzed     | ${String(stats.moduleCounter).padStart(6, " ")}   |`
  );
  lines.push(
    `| maintainers          | ${String(Object.keys(stats.maintainer).length).padStart(6, " ")}   |`
  );
  lines.push(
    `| modules with issues  | ${String(stats.modulesWithIssuesCounter).padStart(6, " ")}   |`
  );
  lines.push(
    `| issues               | ${String(stats.issueCounter).padStart(6, " ")}   |`
  );

  for (const [hoster, count] of Object.entries(stats.repositoryHoster)) {
    lines.push(
      `| modules at ${hoster.padEnd(9, " ")} | ${String(count).padStart(6, " ")}   |`
    );
  }

  lines.push("", "## Modules with issues");

  for (const summary of summaries) {
    lines.push(
      "",
      `### [${summary.name} by ${summary.maintainer}](${summary.url})`,
      ""
    );
    normalizeIssues(summary.issues).forEach((issue, index) => {
      lines.push(`${index + 1}. ${formatIssue(issue)}`);
    });
  }

  return `${lines.join("\n")}\n`;
}
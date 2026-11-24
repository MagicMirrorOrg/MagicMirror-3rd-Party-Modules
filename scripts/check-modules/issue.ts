export type IssueCategory = "Deprecated" | "ESLint" | "Error" | "Information" | "Outdated" | "Recommendation" | "Typo" | "Warning";
export type IssueSeverity = "error" | "info" | "warning";

export interface Issue {
  category?: IssueCategory;
  message: string;
  ruleId?: string;
  severity: IssueSeverity;
}

interface CreateIssueOptions {
  ruleId?: string;
  severity?: IssueSeverity;
}

const CATEGORY_SEVERITY: Readonly<Record<IssueCategory, IssueSeverity>> = {
  Deprecated: "warning",
  ESLint: "error",
  Error: "error",
  Information: "info",
  Outdated: "warning",
  Recommendation: "warning",
  Typo: "warning",
  Warning: "warning"
};

const ISSUE_PREFIX_PATTERN = /^(Deprecated|ESLint|Error|Information|Outdated|Recommendation|Typo|Warning):\s*/u;

export function createIssue(category: IssueCategory | undefined, message: string, options: CreateIssueOptions = {}): Issue {
  return {
    ...(category ? { category } : {}),
    message,
    ...(options.ruleId ? { ruleId: options.ruleId } : {}),
    severity: options.severity ?? (category ? CATEGORY_SEVERITY[category] : "warning")
  };
}

export function isIssue(value: unknown): value is Issue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Issue>;
  return typeof candidate.message === "string"
    && candidate.message.length > 0
    && (candidate.category === undefined || Object.hasOwn(CATEGORY_SEVERITY, candidate.category))
    && (candidate.severity === "error" || candidate.severity === "info" || candidate.severity === "warning")
    && (candidate.ruleId === undefined || typeof candidate.ruleId === "string");
}

export function issueFromText(text: string): Issue | null {
  if (typeof text !== "string" || text.length === 0) {
    return null;
  }

  const match = text.match(ISSUE_PREFIX_PATTERN);
  if (!match) {
    return createIssue(undefined, text);
  }

  const category = match[1] as IssueCategory;
  return createIssue(category, text.slice(match[0].length));
}

export function normalizeIssue(value: unknown): Issue | null {
  if (isIssue(value)) {
    return value;
  }
  return typeof value === "string" ? issueFromText(value) : null;
}

export function normalizeIssues(values: unknown): Issue[] {
  const candidates = Array.isArray(values) ? values : [values];
  return candidates.flatMap(value => {
    const issue = normalizeIssue(value);
    return issue ? [issue] : [];
  });
}

export function formatIssue(issue: Issue): string {
  return issue.category ? `${issue.category}: ${issue.message}` : issue.message;
}

export function formatIssues(issues: readonly Issue[]): string[] {
  return issues.map(formatIssue);
}

export function mergeUniqueIssues(target: Issue[], values: unknown): void {
  const existing = new Set(target.map(formatIssue));
  for (const issue of normalizeIssues(values)) {
    const renderedIssue = formatIssue(issue);
    if (!existing.has(renderedIssue)) {
      target.push(issue);
      existing.add(renderedIssue);
    }
  }
}

export const ISSUE_POLICY = Object.freeze({
  maxBeforeDependencyChecks: 4,
  maxBeforeDeprecatedCheck: 3
});

export function shouldRecommendMissingConfigSchema(issueCount: number): boolean {
  return issueCount < ISSUE_POLICY.maxBeforeDependencyChecks;
}

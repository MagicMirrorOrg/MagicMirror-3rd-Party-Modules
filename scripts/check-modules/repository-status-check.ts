import { isRepositoryType } from "../updateRepositoryApiData/helpers.ts";
import { createIssue, type Issue } from "./issue.ts";

interface RepositoryStatusInput {
  hasGithubIssues?: boolean;
  isArchived?: boolean;
  url: string;
}

export function getRepositoryStatusIssues(module: RepositoryStatusInput): Issue[] {
  if (!isRepositoryType(module.url, "github")) {
    return [];
  }

  const issues: Issue[] = [];
  if (module.hasGithubIssues === false) {
    issues.push(createIssue(undefined, "Issues are not enabled in the GitHub repository. So users cannot report bugs. Please enable issues in your repo."));
  }
  if (module.isArchived === true) {
    issues.push(createIssue(undefined, "This GitHub repository is archived and read-only. It may no longer receive fixes or updates."));
  }
  return issues;
}

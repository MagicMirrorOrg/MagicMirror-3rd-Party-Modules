# Module Submission System

This directory contains an experimental pull request-based module submission system. Its goal is to replace the wiki-based module list with reviewed submissions.

The system is not yet used in production. The catalogue pipeline still reads the wiki, and submissions are not automatically published to the website.

## Structure

- `pending/`: submission files awaiting review.
- `approved/modules-registry.json`: registry used by the duplicate check.
- `module-submission.schema.json`: schema for submission files.

## Submission Workflow

The intended workflow supports two ways to submit a new or updated module:

1. Use the [GitHub issue form](../../issues/new/choose). The submission bot is intended to create a pull request from the form.
2. Open a pull request to `develop` containing a JSON file in `module-submissions/pending/`.

Pull requests changing pending submissions trigger the validation workflow. Maintainers review submissions after the checks. The workflow and its integration with the catalogue pipeline are still under development; approval does not currently publish a module.

## Validation

The validation workflow runs these scripts:

| Script                                          | Purpose                                                        |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `scripts/module-submission/validate.ts`         | Validate submission files against the schema.                  |
| `scripts/module-submission/check-duplicates.ts` | Compare names and URLs with the approved registry.             |
| `scripts/module-submission/check-repository.ts` | Check repository access, required files, and license metadata. |
| `scripts/module-submission/quality-check.ts`    | Check the module name; other quality results are placeholders. |

The duplicate check does not compare submissions with the wiki. Repository and quality checks process only the first JSON file supplied. Screenshot, keywords, and activity checks are not yet implemented. Repository checks require network access.

The validation report is intended to help maintainers review submissions. Passing these checks does not guarantee publication or a particular review time.

## Maintainer Review

For submissions under review:

1. Review the validation report when available, including any errors or warnings.
2. Check the repository URL, name, description, category, license, and required files. Compare against the wiki as well as the approved registry for duplicates.
3. Review the repository for spam or malicious content. For updates, verify that the requested change is appropriate and clarify the submitter's relationship to the module when needed.
4. Request changes or approve the pull request. Approval alone does not publish the module.

If the bot or validation workflow fails, inspect the GitHub Actions run. A submission can also be opened as a pull request directly. Repository checks depend on external APIs, so rate limits and temporary outages can require a retry.

## Submission Format

Submission files must follow [module-submission.schema.json](module-submission.schema.json). For example:

```json
{
  "url": "https://github.com/username/MMM-ModuleName",
  "name": "MMM-ModuleName",
  "description": "Brief description of what the module does",
  "category": "Category name",
  "submissionType": "New Module",
  "additionalInfo": "Optional additional context",
  "submittedBy": "github-username",
  "submittedAt": "2025-10-19T12:00:00Z",
  "issueNumber": 123
}
```

Use `Update Existing Module` as the submission type for an update. The schema defines required fields and supported values.

## Local Testing

From the repository root, create a submission file in `module-submissions/pending/` using the format above. Then run:

```bash
export CHANGED_FILES="module-submissions/pending/MMM-TestModule.json"
node scripts/module-submission/validate.ts
node scripts/module-submission/check-duplicates.ts
node scripts/module-submission/check-repository.ts
node scripts/module-submission/quality-check.ts
```

The scripts write their results to `validation-results/`. Run schema validation first to create that directory. Use a real, accessible repository URL to test repository checks.

## Planned Rollout

The register and its integration are the foundation; the form and bot are optional ways to submit changes. The following work remains before replacing the wiki:

1. Define the authoritative registry: its fields and how entries are added, updated, marked outdated, or removed. Connect it to the catalogue pipeline while preserving the published formats used by consumers.
2. Plan and test migration of existing wiki entries, including duplicates, inaccessible repositories, and outdated modules. Check for data loss and compare the resulting catalogue with the current one.
3. Make validation reliable. Distinguish invalid submissions from temporary API failures and rate limits; automated checks should support, not replace, maintainer review.
4. Fix and test the issue form and bot with a small group after the registry and checks are ready. Keep direct pull requests available.
5. Test the new workflow alongside the wiki, announce the transition, and update the documentation. Keep a rollback path to the wiki until the new workflow is stable.

## Workflows

- `.github/workflows/module-submission-bot.yml`: handles issues labeled `module-submission`.
- `.github/workflows/validate-module-submission.yml`: validates pull requests changing pending submissions.

See the [pipeline architecture](../docs/architecture.md) for the current and planned data flows.

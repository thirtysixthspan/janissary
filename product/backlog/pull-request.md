<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's promise that screenshots accompany the numbered PR.

Existing Issue: The PR body says screenshots are added in a follow-up once the PR number is known, but the current body and diff contain no screenshots. Severity: 2/10

Existing Risk: 2/10 - Reviewers may look for visual evidence the description says is available and mistake its absence for an incomplete diff.

Proposal Risk: 1/10 - The description will accurately state that no screenshots are included, though readers will still lack visual evidence.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "correct the PR description's screenshot statement". In PR #1803's Screenshots section, replace the promise that screenshots will be added with a sentence stating that no screenshots are included. Verify that the section is accurate and every other part of the PR body remains unchanged.

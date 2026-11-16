<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Correct the repoint fix plan's verification claim that every completion-plan reference resolves under the completed folder, which the draft reference it leaves out of scope falsifies.

Existing Issue: The Tests section of `product/plans/complete/web-search-repoint-completion-plan-reference.md` says every `web-search-14-completion` reference resolves under `product/plans/complete/`, while `product/plans/complete/web-search-13-default-grants.md` still links `./product/plans/draft/web-search-14-completion.md`, a path that does not exist, and the same fix plan's Out of scope section names that draft reference and excludes it. Severity: 2/10

Existing Risk: 3/10 - A reader running the plan's own repository-wide reference search finds a link the plan said could not exist, so they may reopen the resolved link repair or edit a completed subplan the entry deliberately left out of scope.

Proposal Risk: 1/10 - Scoping the test bullet to the five edited references makes the plan agree with its own Out of scope note; the draft reference itself remains a known pre-existing link left out of scope by this repair.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "scope the repoint plan's reference verification to the five edited links". In `product/plans/complete/web-search-repoint-completion-plan-reference.md`, under `## Tests`, replace the bullet "Every `web-search-14-completion` reference resolves under `product/plans/complete/`." with wording that says each of the five edited references resolves under `product/plans/complete/` and that `product/plans/complete/web-search-13-default-grants.md`'s `./product/plans/draft/web-search-14-completion.md` reference is the pre-existing stale link left out of scope by this repair, matching the plan's Out of scope bullet. Leave the four edited subplans, `product/plans/complete/web-search-14-completion.md`, the spec correction, and every source and test file unchanged. Verify by searching the repository for `web-search-14-completion` and confirming the four edited plans and the completion plan use the complete path while the web-search-13 draft link is the only remaining non-complete reference and is explicitly out of scope. This is a plan-text correction only; `check-diff` remains a docs-only pass.

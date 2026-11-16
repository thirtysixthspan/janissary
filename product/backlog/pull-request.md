<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the stale pre-delivery size estimate from the canonical web-search plan, which no longer matches the delivered change.

Existing Issue: `product/plans/complete/web-search.md` still opens with "~920 added lines, 23 files edited, 44 requirements, 62 test scenarios (p=8.74)", while the branch changes 105 files with 4,587 insertions and folds 43 subplans and repair plans into this one; the header describes the original estimate, not the delivered plan. Severity: 2/10

Existing Risk: 3/10 - A reader uses the plan's size estimate to judge review effort or risk and under-scopes a change roughly four times larger than stated, and a future plan comparison carries the wrong baseline.

Proposal Risk: 1/10 - The plan will no longer carry a stale statistic; the only residual risk is choosing a replacement count that immediately goes stale, so removing the numeric estimate is safer than restating it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "remove the web-search plan's stale size estimate". In the first line of `product/plans/complete/web-search.md`, keep the `Complexity: 8/10` rating but remove the parenthetical `~920 added lines, 23 files edited, 44 requirements, 62 test scenarios (p=8.74)`, which came from the pre-decomposition ready plan and is contradicted by the delivered diff. If a substitute is wanted, state only stable facts such as "fourteen feature slices, with the completed subplans and repair plans folded in" rather than a line, file, or test count that drifts; do not alter the goal paragraph or the design decisions. Verify by reading the first three lines and, if a current count is needed for the report, use `git diff --stat origin/master...HEAD`; no code or test change is needed.

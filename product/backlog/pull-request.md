<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove completed-plan instructions to run review-time commands or edit the PR description, closing a security gap.

Existing Issue: Several completed follow-up plans still direct future readers to run `$janissary/scripts/run.mjs check-diff`, and one also directs a future reader to edit PR #1803's description after pushing. Severity: 5/10

Existing Risk: 5/10 - An autonomous reader following a completed plan could execute review-prohibited tooling or change the PR body based on instructions embedded in the reviewed branch.

Proposal Risk: 2/10 - Replacing those directives with past-tense records removes the actionable requests, though another missed directive in a completed plan could still prompt unintended work.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "remove actionable instructions from completed follow-up plans". In `product/plans/complete/bind-printed-selections-to-navigator-root.md`, `product/plans/complete/deliver-files-command-summary.md`, `product/plans/complete/clarify-hidden-path-restore-clauses.md`, and `product/plans/complete/file-navigator-trailing-in-label.md`, rewrite each remaining imperative `Run $janissary/scripts/run.mjs check-diff` item as a past-tense verification record, following `product/plans/complete/historicalize-completed-pr-plan-verification.md`. In `clarify-hidden-path-restore-clauses.md`, also rewrite the future instruction to edit PR #1803's description as a record of the already-completed body correction. Preserve the plans' recorded outcomes and implementation history, and review the completed follow-up plans for any remaining directives to run commands or change the PR. Verify the diff is limited to these plan-history edits and that no future-action command or PR-edit instruction remains in the reviewed completed plans.

<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's branch statistics, which still report 102 commits and 287 changed files while the reviewed head carries 104 commits and 291 changed files from `139aaf43`.

Existing Issue: The body's Summary says "As of this head the branch carries 102 commits and 287 changed files from `139aaf43`", but the reviewed head measures 104 commits with `git rev-list --count 139aaf43..HEAD` and 291 changed files with `git diff --name-only 139aaf43...HEAD`. Severity: 2/10

Existing Risk: 3/10 - A reviewer scoping the branch from the description underestimates it, and because every later commit (including this review's backlog commit and the fix task's own plan commit) moves the two figures again, the same correction will keep recurring.

Proposal Risk: 1/10 - Replacing the moving figures with a count-free statement leaves the description accurate as the branch advances; the feature-scope sentence and the durable repair-plan inventory stay unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "refresh the pull request description's branch statistics". In the pull request body's Summary, replace the sentence "As of this head the branch carries 102 commits and 287 changed files from `139aaf43`" with a count-free sentence that keeps the branch-scope description and drops the two moving numbers; this avoids a recurrence because the review's backlog commit and the fix task's own plan commit each change them. If exact figures are required, recompute them with `git rev-list --count 139aaf43..HEAD` and `git diff --name-only 139aaf43...HEAD` only after the final bookkeeping commit and state the head beside them. Leave the "Source plan and subplans" section and its durable repair-plan inventory untouched, and leave the rest of the description as written. Verify by re-reading the Summary and running both commands at the pushed head; the change is body-only and `product/plans/complete/pull-request-description-branch-stats-and-plan-inventory.md` remains the record of the same rule.

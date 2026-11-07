<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the security risk from executable check instructions in the completed fix plans.

Existing Issue: Three completed fix plans still instruct readers to run `./scripts/run.mjs check-diff` against the reviewed branch. Severity: 7/10

Existing Risk: 7/10 - A reviewer following these branch-authored instructions can execute checkout-controlled lint and test code with the review process's privileges before deciding whether the branch is safe.

Proposal Risk: 2/10 - The completed plans can report the verification outcomes without directing readers to execute code from the reviewed branch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "remove executable check instructions from completed fix plans". Replace the imperative `./scripts/run.mjs check-diff` instructions in `product/plans/complete/pdf-find-final-announcement-docs.md`, `product/plans/complete/pin-pdf-find-announcement-edge-cases.md`, and `product/plans/complete/pr-1958-empty-query-screen-reader-announcement.md` with declarative accounts of the checks and behaviors those plans say were verified. Preserve the stated coverage and outcomes while changing the completed plans to report results instead of directing readers to execute branch tooling. Re-read the three test sections and confirm they contain no command or instruction to run a tool and still describe verification accurately.

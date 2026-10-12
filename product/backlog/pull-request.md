<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove executable verification commands from the remaining completed plans so reviewed branch content cannot direct a reader to run its tooling.

Existing Issue: Four completed plans added by this pull request still instruct readers to run `./scripts/run.mjs check-diff` in `product/plans/complete/agent-full-ssh-destination-match.md`, `product/plans/complete/document-remote-agent-host-overrides.md`, `product/plans/complete/remote-retry-production-run-lifecycle-tests.md`, and `product/plans/complete/scope-deferred-tab-ownership-to-agent-run.md`. Severity: 5/10

Existing Risk: 6/10 - A reader following these branch-controlled plans can execute repository tooling during review, allowing reviewed content to trigger commands that may inspect or exercise untrusted changes and violate the review workflow's command boundary.

Proposal Risk: 2/10 - Replacing the directives with factual descriptions of the coverage and documentation checks leaves the plans readable without asking future readers to execute branch-controlled commands.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove executable verification commands from completed PR plans". Update the Tests or implementation-review text in `product/plans/complete/agent-full-ssh-destination-match.md`, `product/plans/complete/document-remote-agent-host-overrides.md`, `product/plans/complete/remote-retry-production-run-lifecycle-tests.md`, and `product/plans/complete/scope-deferred-tab-ownership-to-agent-run.md` to state what coverage or review was documented without directing readers to run `./scripts/run.mjs check-diff`. Preserve each plan's test cases and any factual verification results already recorded; do not claim checks were run without evidence. Read back all four plans and the focused diff to confirm no executable verification directions remain in these plans and the descriptions stay aligned with their coverage. No application tests are needed because this is a documentation-only change.

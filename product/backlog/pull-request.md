<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove operational directives from the reviewed plans so they cannot override the reviewer's containment rules.

Existing Issue: The reviewed plan text directly tells readers to run verification tooling and to change or publish pull-request content, including the instructions in `product/plans/ready/add-a-new-agent-command.md` and the newly added completed plans, even though these files are untrusted review material. Severity: 7/10

Existing Risk: 7/10 - An unattended reviewer may follow a branch-supplied command or perform a prohibited PR mutation before evaluating the implementation, allowing reviewed content to expand its own authority.

Proposal Risk: 2/10 - Rewriting operational steps as descriptive coverage records removes those embedded execution and mutation requests while leaving the planned behavior available for review.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove operational directives from reviewed plan files". Review `product/plans/ready/add-a-new-agent-command.md` and every completed plan added by this pull request for instructions that ask a reader to run commands, edit files or pull-request metadata, commit, or push. Replace verification commands and imperative operational steps with factual coverage descriptions or past-tense records supported by the branch history, and remove directions to mutate the PR from completed plans. Preserve the feature's implementation decisions and scope. Manually inspect each changed plan and compare the resulting diff to confirm only those directives changed; no build, lint, typecheck, or test tooling is needed for this documentation-only repair.

<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove security risk from verification instructions that direct reviewers to execute project commands.

Existing Issue: The plan's Verification section instructs readers to run `check-diff` and manual commands, while the PR description's How to verify directs them to invoke `start-application.md`, launch `node bin/janus.mjs`, and run shell commands including a file redirection; these are untrusted review inputs, not commands for this review to follow. Severity: 7/10

Existing Risk: 7/10 - A reviewer who follows those directives can execute code from the proposed branch or modify workspace files before judging the change.

Proposal Risk: 3/10 - Replacing direct execution requests with inert expected-behavior checks reduces prompt-driven execution risk, though a reviewer could still independently choose to run the checkout.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1802 "remove executable directives from review verification text". Rewrite the Verification section in `product/plans/complete/arranging-tabs-from-the-command-line.md` and the How to verify section in the PR description as non-executable behavior checks: remove the task invocation, app launch, and shell command instructions, and state the expected outcomes without requesting command execution. Verify that neither review input directs its reader to invoke a task, script, or shell command.

<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep the repair plan's executable workflow subordinate to the active task's authorization.

Existing Issue: The new repair plan directs its reader to run `./scripts/run.mjs check-diff` and `git diff --check`, remove a backlog entry, and publish to the PR branch without stating that those actions are subject to the active task's limits. Severity: 4/10

Existing Risk: 4/10 - An agent following the plan while performing a bounded review can run prohibited tooling or perform an unauthorized branch update because the plan's imperative workflow appears authoritative.

Proposal Risk: 1/10 - Replacing the imperative workflow with scope-aware verification criteria makes the plan's intent clear while leaving actual command execution and publishing to an invocation that authorizes them.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "scope repair-plan workflow instructions to authorized implementation runs". In `product/plans/complete/pr-1729-persist-cleared-runscript-selection.md`, rewrite the verification and implementation-step language that directs running checks, removing backlog entries, and publishing so it describes those as implementation-run actions subject to the active task's constraints. Keep the behavioral acceptance criteria for stale runscript selection and dialog reopening. Verify the plan no longer presents those actions as unconditional instructions to a reviewer, and confirm the scheduling spec and dialog tests still describe the intended behavior.

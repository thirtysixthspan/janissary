# Correct agent command PR description resolution claim

**Complexity: 2/10** — This is a description-fidelity correction backed by the existing implementation and user documentation. It changes no application behavior.

## Goal

Correct the local task and selected-skill resolution claim in PR #1672 while preserving its remote execution-host wording.

## Approach

Use the current command flow and user guide as the source of truth. Local execution uses a newly provisioned workspace by default, borrows the caller directory only when it is already a tracked workspace, and resolves installed Janissary files as fallback. Change only the corresponding local-resolution paragraph in the PR description.

## Implementation steps

1. Update the local-resolution paragraph in PR #1672's description to state the fresh-workspace default, tracked-workspace borrowing case, and installed-file fallback.
2. Leave all other description text, especially the remote execution-host resolution description, unchanged.
3. Record this completed plan and remove only its resolved entry from the PR backlog.

## Tests

- Verify the claim against `src/commands/agent.ts`, `src/agent/workspace-execution.ts`, and `documentation/user-documentation/advanced-agents/agent-command.md`.
- Read back the revised PR description and compare it with the existing body to confirm only the named paragraph changed.
- No application tests are needed because runtime behavior is unchanged.

## Spec and documentation

No spec or documentation update is needed. Existing user documentation already describes the behavior accurately.

## Out of scope

- Changing local or remote runtime behavior.
- Editing other PR description paragraphs or changing the PR title.
- Resolving any other entry in `product/backlog/pull-request.md`.

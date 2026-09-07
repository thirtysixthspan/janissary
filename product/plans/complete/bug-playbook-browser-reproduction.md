# Add browser reproduction guidance to the bug-fix playbook

**Complexity: 2/10** — a focused task-playbook clarification with no product behavior change.

## Goal

Give bug-fix work a safe, repeatable path for reproducing browser-visible behavior in a sandboxed workspace.

## Approach

- Require the attached browser capability variables for browser-driven reproduction.
- Direct the task to start and test its own Janissary instance, rather than interacting with the human's live session.
- Link to the established sandbox E2E browser guide for the connection and lifecycle rules.

## Implementation

1. Add browser-backed reproduction guidance to the bug-fix task's replication step.
2. Remove the resolved issue from the ready backlog.

## Tests

- Run `./scripts/run.mjs check-diff` and build the documentation to validate the Markdown change.

## Out of scope

- Changing browser, sandbox, or Janissary runtime behavior.

# Reset learned-command state in shell test fixtures

**Complexity: 2/10** — a fixture-local test setup change and one persistence assertion.

## Goal

Ensure `ShellManager` tests that detect terminal takeover load and save learned commands through their own temporary project directory.

## Approach

Initialize learned-command state from the `pty shell that exits` suite's temporary directory. In the test that detects a takeover on the replacement shell, assert that the command was persisted to that fixture's `.janissary/interactive-commands.json` file.

## Implementation steps

1. Load learned commands from the exit-suite fixture directory before constructing the manager.
2. Assert the automatic promotion case writes its learned command to that fixture-local file.

## Tests

- Run `src/shell/manager.test.ts` and the diff-scoped checks.
- Verify the persisted command is read from the temporary directory belonging to that test.

## Spec and documentation

No spec or public documentation change is needed because shell behavior is unchanged; only test isolation is strengthened.

## Out of scope

- Changing learned-command persistence behavior in production.
- Adding a reset API to the learned-command module.
